import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { childFolderName, childIdFromFolder, safeFolderName } from './paths';

/**
 * The naming rules, which are the whole reason a renamed folder does not orphan a child's work.
 *
 * `node --test` rather than jest: the agent has no build tooling of its own and no reason to acquire
 * any. Node 22 runs TypeScript directly and has a test runner in the box.
 */
describe('child folders', () => {
    it('carries the id, so two children with the same name do not collide', () => {
        const first = childFolderName({ id: 12, firstName: 'Andrei', lastName: 'Popescu' });
        const second = childFolderName({ id: 31, firstName: 'Andrei', lastName: 'Ionescu' });

        assert.notEqual(first, second);
        assert.equal(childIdFromFolder(first), 12);
        assert.equal(childIdFromFolder(second), 31);
    });

    it('reads the id back out of a folder somebody has renamed by hand', () => {
        // The name is for the teacher, the id is for the agent. A teacher who corrects a spelling in
        // Explorer must not make the files inside unplaceable.
        assert.equal(childIdFromFolder('Andrei P. (#12)'), 12);
        assert.equal(childIdFromFolder('Andrei (#12) '), 12);
    });

    it('refuses to guess about a folder that has no id', () => {
        assert.equal(childIdFromFolder('Andrei Popescu'), null);
        assert.equal(childIdFromFolder('_neatribuite'), null);
    });
});

describe('folder names', () => {
    it('replaces the characters Windows will not take', () => {
        // "Scratch 5/6" is a real group name, and a slash in it would silently create a nested
        // folder rather than failing.
        assert.equal(safeFolderName('Scratch 5/6'), 'Scratch 5-6');
        assert.equal(safeFolderName('Clasa "mare"'), 'Clasa -mare-');
    });

    it('replaces rather than strips, so two names do not collapse into one folder', () => {
        assert.notEqual(safeFolderName('Web: avansati'), safeFolderName('Web avansati'));
    });

    it('drops the trailing dot Windows silently removes', () => {
        // Windows quietly stores "Grupa." as "Grupa", so the agent would look for a folder that
        // does not exist under the name it thinks it created.
        assert.equal(safeFolderName('Grupa.'), 'Grupa');
    });
});
