const cluster = require('cluster');
const os = require('os');

// Get the number of CPU cores
const numCPUs = os.cpus().length;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  console.log(`Forking ${numCPUs} worker processes...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code: ${code}, and signal: ${signal}`);
    console.log('Starting a new worker');
    cluster.fork();
  });

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('Master received SIGINT, shutting down workers...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit(0);
  });

} else {
  // Worker process - run the normal server
  require('./server.js');
  console.log(`Worker ${process.pid} started`);
}