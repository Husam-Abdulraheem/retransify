import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFile } from './astParser.js';
import fs from 'fs/promises';

// Mock fs.readFile
vi.mock('fs/promises');

describe('astParser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const TEST_CODE = `
        import React, { useState, useEffect } from 'react';
        import { UsedComponent } from './components/Used';
        import { UnusedComponent } from './components/Unused';
        
        export default function App() {
            const [count, setCount] = useState(0); 
            
            return (
                <UsedComponent count={count} />
            );
        }
    `;

    it('should return the raw AST object', async () => {
        fs.readFile.mockResolvedValue(TEST_CODE);
        const result = await parseFile('/path/to/test.js');
        
        expect(result.ast).toBeDefined();
        expect(typeof result.ast).toBe('object');
        // Simple check that it is indeed a Babel AST
        expect(result.ast.type).toBe('File');
    });

    it('should include location data for imports', async () => {
        fs.readFile.mockResolvedValue(TEST_CODE);
        const result = await parseFile('/path/to/test.js');
        
        const reactImport = result.imports.find(i => i.source === 'react');
        expect(reactImport).toBeDefined();
        expect(reactImport.loc).toBeDefined();
        expect(reactImport.loc.start).toBeDefined();
        expect(reactImport.loc.end).toBeDefined();
        
        // Specifier location
        const useStateSpec = reactImport.specifiers.find(s => s.local === 'useState');
        expect(useStateSpec.loc).toBeDefined();
    });

    it('should correctly calculate usage counts (Scope Analysis)', async () => {
        fs.readFile.mockResolvedValue(TEST_CODE);
        const result = await parseFile('/path/to/test.js');
        
        const reactImport = result.imports.find(i => i.source === 'react');
        
        // useState is used
        const useStateSpec = reactImport.specifiers.find(s => s.local === 'useState');
        expect(useStateSpec.usageCount).toBeGreaterThan(0);
        
        // useEffect is NOT used
        const useEffectSpec = reactImport.specifiers.find(s => s.local === 'useEffect');
        expect(useEffectSpec.usageCount).toBe(0);
        
        // UsedComponent is used in JSX
        const usedCompImport = result.imports.find(i => i.source === './components/Used');
        const usedCompSpec = usedCompImport.specifiers[0];
        expect(usedCompSpec.usageCount).toBeGreaterThan(0);

        // UnusedComponent is NOT used
        const unusedCompImport = result.imports.find(i => i.source === './components/Unused');
        const unusedCompSpec = unusedCompImport.specifiers[0];
        expect(unusedCompSpec.usageCount).toBe(0);
    });
});
