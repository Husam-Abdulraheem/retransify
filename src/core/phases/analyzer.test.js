
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Analyzer } from './analyzer';
import fs from 'fs-extra';
import path from 'path';

vi.mock('fs-extra');
vi.mock('path');

describe('Analyzer', () => {
  let analyzer;
  let mockContext;
  const mockProjectPath = '/mock/project/path';

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new Analyzer(mockProjectPath);
    mockContext = {
      addFact: vi.fn(),
      facts: {}
    };
    // Fix path.join mock to actually join strings with /
    path.join.mockImplementation((...args) => args.join('/'));
  });

  it('should detect TypeScript if tsconfig.json exists', async () => {
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.endsWith('package.json')) return true;
      if (filePath.endsWith('tsconfig.json')) return true;
      return false;
    });
    fs.readJson.mockResolvedValue({ dependencies: {} });

    await analyzer.analyze(mockContext);

    const techCall = mockContext.addFact.mock.calls.find(call => call[0] === 'tech');
    expect(techCall).toBeDefined();
    expect(techCall[1].language).toBe('TypeScript');
  });

  it('should detect Tailwind via config file', async () => {
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.endsWith('package.json')) return true;
      if (filePath.endsWith('tailwind.config.js')) return true;
      return false;
    });
    fs.readJson.mockResolvedValue({ dependencies: {} });

    await analyzer.analyze(mockContext);

    const techCall = mockContext.addFact.mock.calls.find(call => call[0] === 'tech');
    expect(techCall).toBeDefined();
    expect(techCall[1].styling).toBe('Tailwind');
  });

  it('should detect Redux only if used in entry files (Zombie Check)', async () => {
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.endsWith('package.json')) return true;
      if (filePath.endsWith('src/index.js')) return true;
      return false;
    });
    fs.readJson.mockResolvedValue({ 
      dependencies: { 'react-redux': '^7.2.0' }
    });
    
    // Mock file content to include Provider
    fs.readFile.mockImplementation((filePath) => {
      if (filePath.endsWith('src/index.js')) return Promise.resolve('import { Provider } from "react-redux";');
      return Promise.reject('File not found');
    });

    await analyzer.analyze(mockContext);

    const techCall = mockContext.addFact.mock.calls.find(call => call[0] === 'tech');
    expect(techCall).toBeDefined();
    expect(techCall[1].stateManagement).toBe('Redux');
  });

  it('should IGNORE Redux if NOT used in entry files (Zombie Check)', async () => {
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.endsWith('package.json')) return true;
      if (filePath.endsWith('src/index.js')) return true;
      return false;
    });
    fs.readJson.mockResolvedValue({ 
      dependencies: { 'react-redux': '^7.2.0' }
    });
    
    // Mock file content WITHOUT Provider
    fs.readFile.mockImplementation((filePath) => {
      if (filePath.endsWith('src/index.js')) return Promise.resolve('console.log("Hello World");');
      return Promise.reject('File not found');
    });

    await analyzer.analyze(mockContext);

    const techCall = mockContext.addFact.mock.calls.find(call => call[0] === 'tech');
    expect(techCall).toBeDefined();
    expect(techCall[1].stateManagement).toBe('None');
  });

  it('should detect React Native Router', async () => {
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.endsWith('package.json')) return true;
      if (filePath.endsWith('src/App.js')) return true;
      return false;
    });
    fs.readJson.mockResolvedValue({ 
      dependencies: { 'react-router-dom': '^6.0.0' }
    });
    
    fs.readFile.mockImplementation((filePath) => {
      if (filePath.endsWith('src/App.js')) return Promise.resolve('<BrowserRouter>');
      return Promise.reject();
    });

    await analyzer.analyze(mockContext);

    const techCall = mockContext.addFact.mock.calls.find(call => call[0] === 'tech');
    expect(techCall).toBeDefined();
    expect(techCall[1].routing).toBe('ReactRouter');
  });
});
