import { PluginDefinition, PluginViewProps } from '../types';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Storage keys
const INSTALLED_PLUGINS_KEY = 'gutemusik:installed-plugins';

// Plugin manifest format (inside .gutemusik zip or plugin folder)
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  icon?: string; // ChromeIcon name or 'custom'
}

// Stored plugin metadata
export interface InstalledPlugin {
  manifest: PluginManifest;
  code: string; // The bundled JS code
  installedAt: number;
}

// Global registry for dynamic plugins
const dynamicPlugins: Map<string, PluginDefinition> = new Map();

// Expose registration API globally
declare global {
  interface Window {
    GuteMusik: {
      // Plugin registration
      registerPlugin: (plugin: PluginDefinition) => void;

      // React and hooks
      React: typeof React;
      useState: typeof useState;
      useEffect: typeof useEffect;
      useCallback: typeof useCallback;
      useRef: typeof useRef;
      useMemo: typeof useMemo;

      // Tauri IPC
      invoke: typeof invoke;
      listen: typeof listen;

      // Utilities
      createElement: typeof React.createElement;
    };
  }
}

// Initialize the global API
export function initPluginAPI() {
  window.GuteMusik = {
    // Plugin registration
    registerPlugin: (plugin: PluginDefinition) => {
      console.log(`[Plugins] Registered: ${plugin.id}`);
      dynamicPlugins.set(plugin.id, plugin);
    },

    // React and hooks - plugins use these instead of importing
    React,
    useState,
    useEffect,
    useCallback,
    useRef,
    useMemo,

    // Tauri IPC - plugins can call backend commands
    invoke,
    listen,

    // Convenience
    createElement: React.createElement,
  };
}

// Get all installed plugins from localStorage
export function getInstalledPlugins(): InstalledPlugin[] {
  try {
    return JSON.parse(localStorage.getItem(INSTALLED_PLUGINS_KEY) || '[]');
  } catch {
    return [];
  }
}

// Save installed plugins to localStorage
function saveInstalledPlugins(plugins: InstalledPlugin[]) {
  localStorage.setItem(INSTALLED_PLUGINS_KEY, JSON.stringify(plugins));
}

// Load and execute a plugin's code
function executePluginCode(plugin: InstalledPlugin): boolean {
  try {
    // Create a script element and execute the plugin code
    const script = document.createElement('script');
    script.textContent = plugin.code;
    script.setAttribute('data-plugin-id', plugin.manifest.id);
    document.head.appendChild(script);
    return true;
  } catch (err) {
    console.error(`[Plugins] Failed to execute ${plugin.manifest.id}:`, err);
    return false;
  }
}

// Load all installed plugins on startup
export function loadInstalledPlugins(): PluginDefinition[] {
  const installed = getInstalledPlugins();

  for (const plugin of installed) {
    executePluginCode(plugin);
  }

  // Return all successfully registered plugins
  return Array.from(dynamicPlugins.values());
}

// Import a plugin from a .gutemusik file (zip containing manifest.json + index.js)
export async function importPlugin(file: File): Promise<{ success: boolean; error?: string; plugin?: PluginManifest }> {
  try {
    // Read the file as a zip
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);

    // Read manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return { success: false, error: 'Invalid plugin: missing manifest.json' };
    }
    const manifestText = await manifestFile.async('string');
    const manifest: PluginManifest = JSON.parse(manifestText);

    // Validate manifest
    if (!manifest.id || !manifest.name || !manifest.version) {
      return { success: false, error: 'Invalid manifest: missing required fields (id, name, version)' };
    }

    // Read plugin code
    const codeFile = zip.file('index.js');
    if (!codeFile) {
      return { success: false, error: 'Invalid plugin: missing index.js' };
    }
    const code = await codeFile.async('string');

    // Check if already installed
    const installed = getInstalledPlugins();
    const existingIndex = installed.findIndex(p => p.manifest.id === manifest.id);

    const newPlugin: InstalledPlugin = {
      manifest,
      code,
      installedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      // Update existing
      installed[existingIndex] = newPlugin;
    } else {
      // Add new
      installed.push(newPlugin);
    }

    saveInstalledPlugins(installed);

    // Execute immediately
    executePluginCode(newPlugin);

    return { success: true, plugin: manifest };
  } catch (err) {
    console.error('[Plugins] Import failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Import a plugin from a folder (via FileSystemDirectoryHandle or file list)
export async function importPluginFolder(files: FileList | File[]): Promise<{ success: boolean; error?: string; plugin?: PluginManifest }> {
  try {
    const fileArray = Array.from(files);

    // Find manifest.json
    const manifestFile = fileArray.find(f => f.name === 'manifest.json' || f.webkitRelativePath?.endsWith('/manifest.json'));
    if (!manifestFile) {
      return { success: false, error: 'Invalid plugin folder: missing manifest.json' };
    }

    const manifestText = await manifestFile.text();
    const manifest: PluginManifest = JSON.parse(manifestText);

    // Validate manifest
    if (!manifest.id || !manifest.name || !manifest.version) {
      return { success: false, error: 'Invalid manifest: missing required fields (id, name, version)' };
    }

    // Find index.js
    const codeFile = fileArray.find(f => f.name === 'index.js' || f.webkitRelativePath?.endsWith('/index.js'));
    if (!codeFile) {
      return { success: false, error: 'Invalid plugin folder: missing index.js (run build.sh first)' };
    }

    const code = await codeFile.text();

    // Install the plugin
    const installed = getInstalledPlugins();
    const existingIndex = installed.findIndex(p => p.manifest.id === manifest.id);

    const newPlugin: InstalledPlugin = {
      manifest,
      code,
      installedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      installed[existingIndex] = newPlugin;
    } else {
      installed.push(newPlugin);
    }

    saveInstalledPlugins(installed);
    executePluginCode(newPlugin);

    return { success: true, plugin: manifest };
  } catch (err) {
    console.error('[Plugins] Folder import failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Remove an installed plugin
export function removePlugin(pluginId: string): boolean {
  const installed = getInstalledPlugins();
  const filtered = installed.filter(p => p.manifest.id !== pluginId);

  if (filtered.length === installed.length) {
    return false; // Not found
  }

  saveInstalledPlugins(filtered);
  dynamicPlugins.delete(pluginId);

  // Remove the script tag
  const script = document.querySelector(`script[data-plugin-id="${pluginId}"]`);
  script?.remove();

  return true;
}

// Get all dynamic plugins (for merging with built-in plugins)
export function getDynamicPlugins(): PluginDefinition[] {
  return Array.from(dynamicPlugins.values());
}

// Export a plugin to a .gutemusik file
export async function exportPlugin(pluginId: string): Promise<Blob | null> {
  const installed = getInstalledPlugins();
  const plugin = installed.find(p => p.manifest.id === pluginId);

  if (!plugin) {
    return null;
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify(plugin.manifest, null, 2));
  zip.file('index.js', plugin.code);

  return zip.generateAsync({ type: 'blob' });
}
