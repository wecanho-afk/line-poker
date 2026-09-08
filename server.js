// All launch paths use the same game engine and HTTP API.
if (process.env.VERCEL) process.env.NO_SERVER = '1';
module.exports = require('./app').app;
