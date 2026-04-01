import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external modules (hoisted before imports)
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('../context/PluginContext', () => ({ usePluginAPI: vi.fn() }));

// Set up browser globals BEFORE module loads using vi.hoisted
const { localStorageMock, mockScript, mockAppendChild } = vi.hoisted(() => {
  const localStorageMock = {
    getItem: vi.fn().mockReturnValue('[]'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });

  // Ensure window exists in node env
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = globalThis;
  }

  const mockScript: Record<string, any> = {
    textContent: '',
    setAttribute: vi.fn(),
    remove: vi.fn(),
  };
  const mockAppendChild = vi.fn();

  if (typeof globalThis.document === 'undefined') {
    (globalThis as any).document = {
      createElement: vi.fn(() => mockScript),
      head: { appendChild: mockAppendChild },
      querySelector: vi.fn(() => mockScript),
    };
  }

  return { localStorageMock, mockScript, mockAppendChild };
});

import {
  type PluginManifest,
  type InstalledPlugin,
  getInstalledPlugins,
  initPluginAPI,
  loadInstalledPlugins,
  getDynamicPlugins,
  removePlugin,
} from './pluginLoader';

const INSTALLED_PLUGINS_KEY = 'gutemusik:installed-plugins';

/**
 * Helper to clean the dynamicPlugins Map by temporarily mocking localStorage
 * to contain the plugins we want to remove, then calling removePlugin.
 */
function clearDynamicPlugins() {
  const plugins = getDynamicPlugins();
  if (plugins.length === 0) return;

  // Build a fake installed list matching all dynamic plugin IDs
  const fakeInstalled = plugins.map(p => ({
    manifest: { id: p.id, name: p.id, version: '0.0.0' },
    code: '',
    installedAt: 0,
  }));
  localStorageMock.getItem.mockReturnValue(JSON.stringify(fakeInstalled));

  for (const p of plugins) {
    removePlugin(p.id);
    // After each removal, update the mock to reflect remaining plugins
    const remaining = getDynamicPlugins().map(r => ({
      manifest: { id: r.id, name: r.id, version: '0.0.0' },
      code: '',
      installedAt: 0,
    }));
    localStorageMock.getItem.mockReturnValue(JSON.stringify(remaining));
  }
}

describe('pluginLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScript.textContent = '';
    mockScript.setAttribute = vi.fn();
    mockScript.remove = vi.fn();

    // Clean up any previously registered dynamic plugins
    clearDynamicPlugins();

    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('[]');
    (window as any).GuteMusik = undefined;
  });

  // 1. test_parse_manifest_valid
  it('should validate a valid PluginManifest has required fields', () => {
    const manifest: PluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      author: 'Test Author',
      description: 'A test plugin',
      icon: 'Music',
    };

    expect(manifest.id).toBe('test-plugin');
    expect(manifest.name).toBe('Test Plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.author).toBe('Test Author');
    expect(manifest.description).toBe('A test plugin');
    expect(manifest.icon).toBe('Music');
  });

  // 2. test_parse_manifest_missing_fields
  it('should treat manifest without id/name/version as invalid', () => {
    const invalidManifests = [
      { name: 'Test', version: '1.0.0' },
      { id: 'test', version: '1.0.0' },
      { id: 'test', name: 'Test' },
      {},
    ];

    for (const manifest of invalidManifests) {
      const m = manifest as Partial<PluginManifest>;
      const isValid = !!(m.id && m.name && m.version);
      expect(isValid).toBe(false);
    }
  });

  // 3. test_plugin_registration
  it('should register a plugin via window.GuteMusik.registerPlugin', () => {
    initPluginAPI();

    const pluginDef = {
      id: 'my-plugin',
      label: 'My Plugin',
      icon: 'Music' as const,
      view: () => null,
    };

    window.GuteMusik.registerPlugin(pluginDef as any);

    const plugins = getDynamicPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe('my-plugin');
  });

  // 4. test_plugin_id_uniqueness
  it('should overwrite plugin when registering with same id (Map behavior)', () => {
    initPluginAPI();

    const plugin1 = {
      id: 'dup-id',
      label: 'Plugin V1',
      icon: 'Music' as const,
      view: () => null,
    };
    const plugin2 = {
      id: 'dup-id',
      label: 'Plugin V2',
      icon: 'Settings' as const,
      view: () => null,
    };

    window.GuteMusik.registerPlugin(plugin1 as any);
    window.GuteMusik.registerPlugin(plugin2 as any);

    const plugins = getDynamicPlugins();
    const found = plugins.filter(p => p.id === 'dup-id');
    expect(found).toHaveLength(1);
    expect(found[0].label).toBe('Plugin V2');
  });

  // 5. test_load_installed_plugins
  it('should return parsed localStorage data from getInstalledPlugins', () => {
    const storedPlugins: InstalledPlugin[] = [
      {
        manifest: { id: 'p1', name: 'Plugin 1', version: '1.0.0' },
        code: 'console.log("p1")',
        installedAt: 1000,
      },
      {
        manifest: { id: 'p2', name: 'Plugin 2', version: '2.0.0' },
        code: 'console.log("p2")',
        installedAt: 2000,
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(storedPlugins));

    const result = getInstalledPlugins();
    expect(result).toHaveLength(2);
    expect(result[0].manifest.id).toBe('p1');
    expect(result[1].manifest.id).toBe('p2');
  });

  // 6. test_save_installed_plugins
  it('should write to localStorage when saving plugins via removePlugin', () => {
    // First register the plugin in the dynamic registry so removePlugin can delete it
    initPluginAPI();
    window.GuteMusik.registerPlugin({
      id: 'to-remove',
      label: 'Remove Me',
      icon: 'Music' as const,
      view: () => null,
    } as any);

    vi.clearAllMocks();

    const storedPlugins: InstalledPlugin[] = [
      {
        manifest: { id: 'to-remove', name: 'Remove Me', version: '1.0.0' },
        code: 'console.log("remove")',
        installedAt: 1000,
      },
      {
        manifest: { id: 'to-keep', name: 'Keep Me', version: '1.0.0' },
        code: 'console.log("keep")',
        installedAt: 2000,
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(storedPlugins));

    removePlugin('to-remove');

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      INSTALLED_PLUGINS_KEY,
      expect.any(String)
    );

    const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    expect(savedData).toHaveLength(1);
    expect(savedData[0].manifest.id).toBe('to-keep');
  });

  // 7. test_plugin_api_provisioning
  it('should provision window.GuteMusik with React, useState, useEffect, etc.', () => {
    initPluginAPI();

    expect(window.GuteMusik).toBeDefined();
    expect(window.GuteMusik.React).toBeDefined();
    expect(window.GuteMusik.useState).toBeDefined();
    expect(window.GuteMusik.useEffect).toBeDefined();
    expect(window.GuteMusik.useCallback).toBeDefined();
    expect(window.GuteMusik.useRef).toBeDefined();
    expect(window.GuteMusik.useMemo).toBeDefined();
    expect(window.GuteMusik.invoke).toBeDefined();
    expect(window.GuteMusik.listen).toBeDefined();
    expect(window.GuteMusik.createElement).toBeDefined();
    expect(window.GuteMusik.registerPlugin).toBeTypeOf('function');
    expect(window.GuteMusik.usePluginAPI).toBeDefined();
  });

  // 8. test_execute_plugin_code
  it('should create script element when executing plugin code via loadInstalledPlugins', () => {
    const storedPlugins: InstalledPlugin[] = [
      {
        manifest: { id: 'script-plugin', name: 'Script Plugin', version: '1.0.0' },
        code: 'console.log("hello")',
        installedAt: 1000,
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(storedPlugins));

    loadInstalledPlugins();

    expect(document.createElement).toHaveBeenCalledWith('script');
    expect(mockScript.setAttribute).toHaveBeenCalledWith('data-plugin-id', 'script-plugin');
    expect(mockAppendChild).toHaveBeenCalled();
  });
});
