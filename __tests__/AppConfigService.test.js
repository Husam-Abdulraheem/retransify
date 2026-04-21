import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppConfigService } from '../src/core/services/AppConfigService.js';
import fs from 'fs-extra';
import path from 'path';

vi.mock('fs-extra');

describe('AppConfigService', () => {
  const webProjectPath = '/mock/web';
  const expoProjectPath = '/mock/expo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update app.json with sanitized metadata from package.json', async () => {
    const mockWebPackage = {
      name: 'My Awesome-Project!',
    };
    const mockAppJson = {
      expo: {
        name: 'template',
        slug: 'template',
      },
    };

    fs.pathExists.mockImplementation(async (filePath) => {
      if (filePath.endsWith('package.json')) return true;
      if (filePath.endsWith('app.json')) return true;
      return false;
    });

    fs.readJson.mockImplementation(async (filePath) => {
      if (filePath.endsWith('package.json')) return mockWebPackage;
      if (filePath.endsWith('app.json')) return mockAppJson;
      return {};
    });

    const result = await AppConfigService.updateMetadata(
      webProjectPath,
      expoProjectPath
    );

    expect(result.name).toBe('My Awesome-Project! (Retransify)');
    expect(result.slug).toBe('my-awesome-project');
    expect(result.scheme).toBe('myawesomeproject');

    expect(fs.writeJson).toHaveBeenCalledWith(
      expect.stringContaining('app.json'),
      expect.objectContaining({
        expo: expect.objectContaining({
          name: 'My Awesome-Project! (Retransify)',
          slug: 'my-awesome-project',
          scheme: 'myawesomeproject',
        }),
      }),
      { spaces: 2 }
    );
  });

  it('should use default name if web package.json does not exist', async () => {
    const mockAppJson = { expo: {} };

    fs.pathExists.mockImplementation(async (filePath) => {
      if (filePath.endsWith('package.json')) return false;
      if (filePath.endsWith('app.json')) return true;
      return false;
    });

    fs.readJson.mockImplementation(async (filePath) => {
      if (filePath.endsWith('app.json')) return mockAppJson;
      return {};
    });

    const result = await AppConfigService.updateMetadata(
      webProjectPath,
      expoProjectPath
    );

    expect(result.slug).toBe('retransify-app');
    expect(result.scheme).toBe('retransifyapp');
  });

  it('should throw error if app.json is missing', async () => {
    fs.pathExists.mockResolvedValue(false);

    await expect(
      AppConfigService.updateMetadata(webProjectPath, expoProjectPath)
    ).rejects.toThrow(/app.json not found/);
  });
});
