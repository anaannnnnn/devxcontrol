// Runs the panel in demo mode (fake Docker) on any OS: npm run demo. Sign in as admin / Demo@12345
process.env.DEMO = '1';
process.env.INIT_USERS ||= 'admin';
process.env.INIT_PASSWORD ||= 'Demo@12345';
process.env.SESSION_SECRET ||= 'demo-session-secret-demo-session-secret';
process.env.ENV_FILE ||= '/dev/null/none';
await import('../server.js');
