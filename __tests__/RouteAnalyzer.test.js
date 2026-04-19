import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteAnalyzer } from '../src/core/scanners/RouteAnalyzer.js';
import fs from 'fs-extra';

// Mock ui dependency
vi.mock('../src/core/utils/ui.js', () => ({
  ui: {
    step: vi.fn(),
    printSubStep: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('RouteAnalyzer', () => {
  const projectRoot = '/mock/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect and map JSX routes correctly', async () => {
    const mockFilesQueue = [
      {
        filePath: 'src/App.jsx',
        content: `
          import { Route } from 'react-router-dom';
          import Home from './pages/Home';
          import About from './pages/About';

          function App() {
            return (
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
              </Routes>
            );
          }
        `,
      },
    ];

    vi.spyOn(fs, 'readFileSync').mockReturnValue('mock content');
    vi.spyOn(fs, 'readFile').mockResolvedValue('mock content');
    vi.spyOn(fs, 'existsSync').mockImplementation(() => true);

    const { routeMap } = await RouteAnalyzer.analyze(
      projectRoot,
      mockFilesQueue
    );

    console.log('DEBUG RouteMap (JSX):', JSON.stringify(routeMap, null, 2));

    const keys = Object.keys(routeMap);
    expect(keys.length).toBe(2);
    expect(routeMap[keys.find((k) => k.toLowerCase().includes('home'))]).toBe(
      'app/index.tsx'
    );
    expect(routeMap[keys.find((k) => k.toLowerCase().includes('about'))]).toBe(
      'app/about.tsx'
    );
  });

  it('should handle nested routes and layout mapping', async () => {
    const mockFilesQueue = [
      {
        filePath: 'src/App.jsx',
        content: `
          import { Route } from 'react-router-dom';
          import Layout from './Layout';
          import Dashboard from './Dashboard';

          function App() {
            return (
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route path="dashboard" element={<Dashboard />} />
                </Route>
              </Routes>
            );
          }
        `,
      },
    ];

    vi.spyOn(fs, 'existsSync').mockImplementation(() => true);

    const { routeMap } = await RouteAnalyzer.analyze(
      projectRoot,
      mockFilesQueue
    );
    console.log('DEBUG RouteMap (Nested):', JSON.stringify(routeMap, null, 2));

    const keys = Object.keys(routeMap);
    expect(routeMap[keys.find((k) => k.toLowerCase().includes('layout'))]).toBe(
      'app/_layout.tsx'
    );
    expect(
      routeMap[keys.find((k) => k.toLowerCase().includes('dashboard'))]
    ).toBe('app/dashboard.tsx');
  });

  it('should detect dynamic routes with [id] syntax', async () => {
    const mockFilesQueue = [
      {
        filePath: 'src/App.jsx',
        content: `
          import { Route } from 'react-router-dom';
          import UserProfile from './UserProfile';

          function App() {
            return (
              <Routes>
                <Route path="/user/:userId" element={<UserProfile />} />
              </Routes>
            );
          }
        `,
      },
    ];

    vi.spyOn(fs, 'existsSync').mockImplementation(() => true);

    const { routeMap } = await RouteAnalyzer.analyze(
      projectRoot,
      mockFilesQueue
    );
    console.log('DEBUG RouteMap (Dynamic):', JSON.stringify(routeMap, null, 2));

    const keys = Object.keys(routeMap);
    expect(
      routeMap[keys.find((k) => k.toLowerCase().includes('userprofile'))]
    ).toBe('app/user/[userId].tsx');
  });
});
