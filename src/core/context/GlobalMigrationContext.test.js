
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalMigrationContext } from './GlobalMigrationContext.js';


describe('GlobalMigrationContext (Paranoid Tests)', () => {
    let context;

    beforeEach(() => {
        context = new GlobalMigrationContext();
    });

    // Layer 1: Pure Logic & Utilities
    describe('Layer 1: Pure Logic & Utilities', () => {
        it('calculateErrorHash: should be deterministic', () => {
             const hash1 = GlobalMigrationContext.calculateErrorHash("Error at line 10");
             const hash2 = GlobalMigrationContext.calculateErrorHash("Error at line 10");
             expect(hash1).toBe(hash2);
        });

        it('normalizePath: should normalize windows paths', () => {
             const winPath = 'src\\components\\Test.js';
             const normalized = GlobalMigrationContext.normalizePath(winPath);
             expect(normalized).toBe('src/components/Test.js');
        });
    });

    // Layer 2: Phase Enforcement (State Machine)
    describe('Layer 2: Phase Enforcement', () => {
        it('enterPhase: should switch to valid phase', () => {
            context.enterPhase('planner');
            expect(context.currentPhase).toBe('planner');
        });

        it('enterPhase: should throw on invalid phase', () => {
            expect(() => context.enterPhase('super_secret_phase')).toThrow(/Invalid phase transition/);
        });
    });

    // Layer 3: Guard Rails & Access Control (Critical)
    describe('Layer 3: Guard Rails & Access Control', () => {
        it('Illegal Write: should throw when writing to wrong section', () => {
            context.enterPhase('executor');
            // Try to add a FACT (allowed only in Analyzer)
            expect(() => context.addFact('key', 'value')).toThrow(/Illegal Write/);
        });

        it('No Silent Corruption (Atomicity Check)', () => {
            context.enterPhase('analyzer');
            context.addFact('valid', 'data');
            
            // Enter the restrictive phase BEFORE snapshot to isolate the attack's effect
            context.enterPhase('executor');

            // Snapshot Pre-Attack
            const snapshot = context.getSnapshot();

            // Attack: Force Illegal Write
            try {
                context.addFact('illegal', 'data');
            } catch (e) {
                // Ignore error, check state
            }

            // Verify state is unchanged
            const postAttackSnapshot = context.getSnapshot();
            
            // Exclude dynamic timestamp from comparison
            delete snapshot.meta.lastUpdated;
            delete postAttackSnapshot.meta.lastUpdated;

            expect(postAttackSnapshot).toEqual(snapshot);
        });

        it('Immutability: Snapshot should be independent', () => {
            context.enterPhase('analyzer');
            context.addFact('key', 'original');
            
            const snap = context.getSnapshot();
            snap.facts.key = 'mutated'; // Mutate the snapshot
            
            // Original context should be untouched
            expect(context.getFact('key')).toBe('original');
        });
    });

    // Layer 4: Healing & Circuit Breaker (Stability)
    describe('Layer 4: Healing & Circuit Breaker', () => {
        it('Exact Threshold Testing: should stop after max attempts', () => {
            // Mock max attempts to 3
            context.maxHealingAttempts = 3;
            const file = 'test.js';
            const error = 'hash_123';

            // 1
            expect(context.canHeal(file, error)).toBe(true);
            context.recordHealingAttempt(file, { errorHash: error, fixSummary: 'fix1' });
            
            // 2 (New error to avoid loop detection)
            const error2 = 'hash_456';
            expect(context.canHeal(file, error2)).toBe(true);
            context.recordHealingAttempt(file, { errorHash: error2, fixSummary: 'fix2' });

            // 3
            const error3 = 'hash_789';
            expect(context.canHeal(file, error3)).toBe(true);
            context.recordHealingAttempt(file, { errorHash: error3, fixSummary: 'fix3' });

            // 4 -> Should Fail due to max attempts
            const error4 = 'hash_999';
            expect(context.canHeal(file, error4)).toBe(false);
        });

        it('Loop Detection: should block same error hash immediately', () => {
            const file = 'loop.js';
            const error = 'loop_error';

            context.recordHealingAttempt(file, { errorHash: error, fixSummary: 'fix' });
            
            // Try same error again
            expect(context.canHeal(file, error)).toBe(false);
        });
    });
});
