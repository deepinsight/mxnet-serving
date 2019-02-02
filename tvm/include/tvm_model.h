#ifndef __TVM_MODEL__
#define __TVM_MODEL__

#include <string>
#include <vector>

#include <opencv2/opencv.hpp>

#include <nlohmann/json.hpp>
using json = nlohmann::json;

#include "dlpack/dlpack.h"
#include <tvm/runtime/module.h>
#include <tvm/runtime/registry.h>
#include <tvm/runtime/packed_func.h>

class tvm_model {
public:
    tvm_model(std::string path, std::string name, std::string hardware, 
                                int w, int h, int batch=1, int mode=0,int devid=0);
    virtual ~tvm_model(){}
    virtual void prepare(std::vector<float> & image_data, cv::Mat & img);
    void infer(cv::Mat & img); 
protected:
    std::unique_ptr<tvm::runtime::Module> handle;
    std::unique_ptr<DLTensor> infer_buff;
    tvm::runtime::PackedFunc get_output;
    int w;
    int h;
};

void tvmOutputOfIndex(  tvm::runtime::PackedFunc handler,   /* handle of get_output func  */
                        std::vector<float> &out_data,       /* output vector */
                        std::vector<int> &out_shape,        /* output shape */
                        int output_index);

#endif