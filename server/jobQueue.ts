/**
 * 任务处理队列 - 并发控制
 * 限制同时处理的任务数量，防止 FFmpeg 进程和内存耗尽
 */

const MAX_CONCURRENT_JOBS = 2; // 最大并发处理任务数

let activeJobs = 0;
const waitingQueue: Array<() => void> = [];

/**
 * 获取当前活跃任务数
 */
export function getActiveJobCount(): number {
  return activeJobs;
}

/**
 * 获取等待队列长度
 */
export function getWaitingQueueLength(): number {
  return waitingQueue.length;
}

/**
 * 带并发控制地执行任务处理函数
 * 如果当前活跃任务数已达上限，则等待直到有空位
 */
export async function enqueueJob(
  jobId: number,
  processor: (jobId: number) => Promise<void>
): Promise<void> {
  // 等待空位
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    console.log(
      `[Queue] Job ${jobId} 进入等待队列（当前活跃: ${activeJobs}/${MAX_CONCURRENT_JOBS}，等待: ${waitingQueue.length}）`
    );
    await new Promise<void>((resolve) => {
      waitingQueue.push(resolve);
    });
  }

  activeJobs++;
  console.log(
    `[Queue] Job ${jobId} 开始处理（当前活跃: ${activeJobs}/${MAX_CONCURRENT_JOBS}）`
  );

  try {
    await processor(jobId);
  } finally {
    activeJobs--;
    console.log(
      `[Queue] Job ${jobId} 处理完成（当前活跃: ${activeJobs}/${MAX_CONCURRENT_JOBS}）`
    );
    // 通知等待队列中的下一个任务
    const next = waitingQueue.shift();
    if (next) next();
  }
}
