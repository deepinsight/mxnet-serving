#### stress tests
threads-10: 600 requests over 1 min (10 requests/second)
threads-100-gpu: 6000 requests over 1 min (100 requests/second)
threads-150-gpu: 9000 requests over 1 min (150 requests/second)
threads-200-gpu: 12000 requests over 1 min (200 requests/second)

Results show that on 8 GPUs P40, mxnet model server can reach about 200 requests per second.
