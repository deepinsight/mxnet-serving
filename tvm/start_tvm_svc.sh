#!/bin/bash

nodename=`kubectl -n ${MY_POD_NAMESPACE} get pods -o wide|grep ${MY_POD_NAME}|awk '{print $7}'`
echo "pod ${MY_POD_NAME} in node: ${nodename}"

cpufamily=`kubectl -n ${MY_POD_NAMESPACE} label --list  node ${nodename}|grep cpufamily|sed 's/cpufamily=//'`
echo "node cpufamily is "${cpufamily}

echo CPU_COUNT=${CPU_COUNT}

echo "start tvm service : tvm_svc --cpu-family=${cpufamily} --path=/var/lib/tvm_model --ip=0.0.0.0 --cpu-count=${CPU_COUNT} --config=/var/lib/tvm_conf/face_param.toml"

tvm_svc --cpu-family=${cpufamily} --path=/var/lib/tvm_model --ip=0.0.0.0 --cpu-count=${CPU_COUNT} --config=/var/lib/tvm_conf/face_param.toml
