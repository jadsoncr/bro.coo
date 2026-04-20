// src/infra/queue.js
const { Queue, Worker } = require('bullmq');
const { getRedis } = require('./redis');
const { createLead, createAbandono } = require('../storage/postgres');

const QUEUE_NAME = 'lead-persist';

let _queue;

function getQueue() {
  if (!_queue) {
    const redis = getRedis();
    _queue = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  return _queue;
}

async function enqueueLeadPersist(data) {
  return getQueue().add('persist-lead', data);
}

async function enqueueAbandono(data) {
  return getQueue().add('persist-abandono', data);
}

function startWorker() {
  const redis = getRedis();
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === 'persist-lead') {
        await createLead(job.data);
      } else if (job.name === 'persist-abandono') {
        await createAbandono(job.data);
      }
    },
    { connection: redis }
  );

  worker.on('failed', (job, err) => {
    console.error(`[queue] job ${job?.id} falhou:`, err.message);
  });

  return worker;
}

module.exports = { enqueueLeadPersist, enqueueAbandono, startWorker };
