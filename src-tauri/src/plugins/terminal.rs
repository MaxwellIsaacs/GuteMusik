use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, State};

pub struct TerminalInstance {
    pty_pair: PtyPair,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
pub struct TerminalState {
    terminals: Mutex<HashMap<String, Arc<Mutex<TerminalInstance>>>>,
}

#[tauri::command]
pub async fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pty_pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Determine the shell to use
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // Login shell

    // Set working directory (expand ~ to home directory)
    if let Some(dir) = cwd {
        let expanded = if dir.starts_with("~/") {
            if let Some(home) = std::env::var_os("HOME") {
                let home_str = home.to_string_lossy();
                format!("{}{}", home_str, &dir[1..])
            } else {
                dir
            }
        } else if dir == "~" {
            std::env::var("HOME").unwrap_or(dir)
        } else {
            dir
        };
        cmd.cwd(&expanded);
    }

    // Spawn the shell
    let mut child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    let terminal = Arc::new(Mutex::new(TerminalInstance {
        pty_pair,
        writer,
    }));

    state.terminals.lock().insert(id.clone(), terminal);

    // Spawn a thread to read output from the PTY
    let app_clone = app.clone();
    let id_clone = id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("terminal-output-{}", id_clone), data);
                }
                Err(_) => break,
            }
        }
        // Terminal closed
        let _ = app_clone.emit(&format!("terminal-exit-{}", id_clone), ());
    });

    // Spawn a thread to wait for the child process
    let app_clone = app.clone();
    let id_clone = id.clone();
    thread::spawn(move || {
        let _ = child.wait();
        let _ = app_clone.emit(&format!("terminal-exit-{}", id_clone), ());
    });

    Ok(())
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let terminals = state.terminals.lock();
    let terminal = terminals
        .get(&id)
        .ok_or_else(|| "Terminal not found".to_string())?;

    let mut term = terminal.lock();
    term.writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    term.writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let terminals = state.terminals.lock();
    let terminal = terminals
        .get(&id)
        .ok_or_else(|| "Terminal not found".to_string())?;

    let term = terminal.lock();
    term.pty_pair
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn terminal_kill(state: State<'_, TerminalState>, id: String) -> Result<(), String> {
    let mut terminals = state.terminals.lock();
    terminals.remove(&id);
    Ok(())
}
