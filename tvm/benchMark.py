import argparse
import requests
import multiprocessing
import time
import json

parser = argparse.ArgumentParser(description='tvm face server benchmark client')
parser.add_argument('--ip',   type=str, default='172.19.0.12', help='face service url')
parser.add_argument('--ports',type=str, default='8080', help='port list')
parser.add_argument('--image',type=str, default='2019-4-10-10-48.jpg', help='input file')
parser.add_argument('--batch',type=int, default=1, help='image count per request')
parser.add_argument('--loops',type=int, default=2, help='post request count')

args = parser.parse_args()

ip = args.ip
ports = args.ports.split(',')
image = args.image
batch = args.batch
loops = args.loops

def infer(url,image,batch):
  files = []
  for i in range(0,batch):
    files.append(['data', open(image,'rb')])
  t1 = time.time()
  rsp = requests.post(url, files=files)
  t2 = time.time()
  latency = (t2-t1)*1000
  res = json.loads(rsp.content)
  for i in range(0,batch):
    if(res[i]['state']!=0):
      print(res[i]['state'])
  print('latency: %f mili second' % latency )

def worker(url,image,batch,loops):
  for i in range(0, loops):
    infer(url,image,batch)

record = []
for i in range(len(ports)):
    url = 'http://{ip}:{port}'.format(ip=ip,port=ports[i])
    process = multiprocessing.Process(target=worker,args=(url,image,batch,loops))
    process.start()
    record.append(process)

for process in record:
    process.join()

