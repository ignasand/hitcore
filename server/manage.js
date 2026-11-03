'use strict';
// Admin CLI:  node server/manage.js <command>
//   add-user <username> "<Full Name>" [--admin]   prompts for a password (or HITCORE_PASSWORD env)
//   passwd <username>                             reset a password (signs the user out everywhere)
//   disable <username> | enable <username>
//   list-users
//   seed-demo                                     load sample shooters/exercises/session
//   audit [n]                                     show the last n audit-log entries
const path = require('node:path');
const readline = require('node:readline');
const { open } = require('./db');
const A = require('./auth');
const { demoData } = require('./seed');

const repo = open(process.env.HITCORE_DB || path.join(__dirname, '..', 'data', 'hitcore.db'));
const [cmd, ...args] = process.argv.slice(2);

function askPassword(prompt) {
  if (process.env.HITCORE_PASSWORD) return Promise.resolve(process.env.HITCORE_PASSWORD);
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(prompt)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(prompt, a => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}
const need = u => { const x = repo.userByName(u); if (!x) { console.error(`no such user: ${u}`); process.exit(1); } return x; };

(async () => {
  try {
    switch (cmd) {
      case 'add-user': {
        const [username, name] = args.filter(a => !a.startsWith('--'));
        if (!username) throw new Error('usage: add-user <username> "<Full Name>" [--admin]');
        const pw = await askPassword(`Password for ${username}: `);
        const u = repo.createUser({ id: A.newId(), username, name: name || username, role: args.includes('--admin') ? 'admin' : 'coach', passwordHash: A.hashPassword(pw) });
        repo.audit('cli', 'create', 'user', u.id, { username: u.username, role: u.role });
        console.log(`created ${u.role} "${u.username}"`); break;
      }
      case 'passwd': { const u = need(args[0]); repo.setPassword(u.id, A.hashPassword(await askPassword(`New password for ${u.username}: `))); repo.audit('cli', 'password', 'user', u.id); console.log('password updated'); break; }
      case 'disable': case 'enable': { const u = need(args[0]); repo.setDisabled(u.id, cmd === 'disable'); repo.audit('cli', cmd, 'user', u.id); console.log(`${cmd}d ${u.username}`); break; }
      case 'list-users': console.table(repo.listUsers()); break;
      case 'seed-demo': console.log('imported', repo.importData('cli', demoData('cli'))); break;
      case 'audit': console.table(repo.auditLog(+args[0] || 30)); break;
      default: console.log(require('node:fs').readFileSync(__filename, 'utf8').split('\n').slice(1, 9).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    }
  } catch (e) { console.error('error:', e.message); process.exitCode = 1; }
  repo.close();
})();
