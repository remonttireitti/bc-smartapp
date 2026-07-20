#!/usr/bin/env node
/**
 * One-time setup: create GitHub repo (if missing), push main, connect Vercel Git deploy.
 * Requires: git, GitHub auth (gh login or stored git credentials), vercel CLI login.
 */
import { execSync } from 'node:child_process';

const GH = '"C:\\Program Files\\GitHub CLI\\gh.exe"';
const repoName = process.env.BC_SMARTAPP_REPO ?? 'bc-smartapp';
const repoOwner = process.env.BC_SMARTAPP_REPO_OWNER ?? 'remonttireitti';

function run(command, options = {}) {
  execSync(command, { stdio: 'inherit', ...options });
}

function runCapture(command) {
  return execSync(command, { encoding: 'utf8' }).trim();
}

function hasRemote() {
  try {
    runCapture('git remote get-url origin');
    return true;
  } catch {
    return false;
  }
}

function repoExists() {
  try {
    runCapture(`${GH} repo view ${repoOwner}/${repoName} --json name --jq .name`);
    return true;
  } catch {
    return false;
  }
}

run('git branch -M main');

if (!hasRemote()) {
  const remote = `https://github.com/${repoOwner}/${repoName}.git`;
  if (!repoExists()) {
    run(`${GH} repo create ${repoOwner}/${repoName} --private --source=. --remote=origin --push`, {
      env: { ...process.env, GH_PATH: GH },
    });
  } else {
    run(`git remote add origin ${remote}`);
    run('git push -u origin main');
  }
} else {
  run('git push -u origin main');
}

run('npx vercel link --yes --project bc-smartapp');
run(`npx vercel git connect https://github.com/${repoOwner}/${repoName}.git --yes`);

console.log('\nValmis: GitHub + Vercel Git deploy yhdistetty.');
console.log(`Repo: https://github.com/${repoOwner}/${repoName}`);
console.log('Tuotanto: https://bc-smartapp.pages.dev');
