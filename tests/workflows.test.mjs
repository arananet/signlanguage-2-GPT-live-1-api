import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workflow = (name) => parse(read(`.github/workflows/${name}.yml`));

test('CodeQL scans only the application language', () => {
  const jobs = Object.values(workflow('codeql').jobs);
  const analysis = jobs.find((job) => job.strategy?.matrix?.language);
  assert.deepEqual(analysis.strategy.matrix.language, ['javascript-typescript']);
});

test('Scorecard is opt-in and absent from required checks', () => {
  assert.deepEqual(Object.keys(workflow('scorecard').on), ['workflow_dispatch']);
  const ruleset = JSON.parse(read('docs/branch-protection-ruleset.json'));
  const checks = ruleset.rules.find((rule) => rule.type === 'required_status_checks');
  assert.ok(checks.parameters.required_status_checks.every(
    (check) => !/scorecard/i.test(check.context),
  ));
});

test('Markdown lint references a valid configuration file and ignores local artifacts', () => {
  const steps = Object.values(workflow('lint').jobs).flatMap((job) => job.steps);
  const markdown = steps.find((step) => step.uses?.startsWith('DavidAnson/markdownlint-cli2-action@'));
  assert.equal(markdown.with.config, '.markdownlint-cli2.jsonc');
  const config = JSON.parse(read(markdown.with.config));
  assert.equal(config.gitignore, true);
  assert.equal(config.config.default, true);
  assert.equal(config.config.MD013, false);
});