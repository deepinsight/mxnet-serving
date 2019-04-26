#include "tvm_model.h"

#include <fstream>
#include <cassert>

constexpr int dtype_code = kDLFloat;
constexpr int dtype_bits = 32;
constexpr int dtype_lanes = 1;

tvm_model::tvm_model(std::string path, std::string name, std::string hardware, int w, int h, 
                        int batch, int mode, int devid){
    std::string model_path = path + "/" + hardware + "/" + name + "/" + std::to_string(w) + "_" + std::to_string(h);
    tvm::runtime::Module mod_syslib = tvm::runtime::Module::LoadFromFile(model_path + "/deploy_lib.so");
    std::ifstream json_in(model_path + "/deploy_graph.json");
    std::string json_data((std::istreambuf_iterator<char>(json_in)), std::istreambuf_iterator<char>());
    json_in.close();
    int device_type = kDLCPU;
    int device_id = 0;
    if(mode==0){
        device_type = kDLCPU;
        device_id = 0;
    } else if(mode==1){
        device_type = kDLGPU;
        device_id = devid;
    }
    // get global function module for graph runtime
    tvm::runtime::Module mod = (*tvm::runtime::Registry::Get("tvm.graph_runtime.create"))(json_data, mod_syslib, device_type, device_id);
    handle.reset(new tvm::runtime::Module(mod));
    std::ifstream params_in(model_path + "/deploy_param.params", std::ios::binary);
    std::string params_data((std::istreambuf_iterator<char>(params_in)), std::istreambuf_iterator<char>());
    params_in.close();
    TVMByteArray params_arr;
    params_arr.data = params_data.c_str();
    params_arr.size = params_data.length();
    tvm::runtime::PackedFunc load_params = mod.GetFunction("load_params");
    load_params(params_arr);

    //constexpr int device_type = kDLCPU;
    //constexpr int device_id = 0;
    constexpr int in_ndim = 4;
    const int64_t in_shape[in_ndim] = {batch, 3, h, w};
    DLTensor* x;
    TVMArrayAlloc(in_shape, in_ndim, dtype_code, dtype_bits, dtype_lanes, device_type, device_id, &x);
    infer_buff.reset(x);

    this->w = w;
    this->h = h;

}

void tvm_model::prepare(std::vector<float> & image_data, cv::Mat & img){
    size_t size = img.channels() * img.rows * img.cols; 
    float* ptr_image_r = image_data.data();
    float* ptr_image_g = image_data.data() + size / 3;
    float* ptr_image_b = image_data.data() + size / 3 * 2;

    for (int i = 0; i < img.rows; i++) {
        auto data = img.ptr<uchar>(i);
        for (int j = 0; j < img.cols; j++) {
            *ptr_image_b++ = static_cast<float>(*data++);
            *ptr_image_g++ = static_cast<float>(*data++);
            *ptr_image_r++ = static_cast<float>(*data++);
        }
    }
}

void tvm_model::infer(cv::Mat & img){
    assert(img.channels() == 3);
    assert(w==img.cols);
    assert(h==img.rows);
    size_t size = img.channels() * img.rows * img.cols; 
    std::vector<float> image_data(size);
    prepare(image_data, img);
    // memcpy(infer_buff->data, &image_data[0], sizeof(image_data[0]) * image_data.size());
    TVMArrayCopyFromBytes(infer_buff.get(), (void *) &image_data[0], sizeof(image_data[0]) * image_data.size());

    tvm::runtime::PackedFunc set_input = handle->GetFunction("set_input");
    set_input("data", infer_buff.get());
    tvm::runtime::PackedFunc run = handle->GetFunction("run");
    run();
    get_output = handle->GetFunction("get_output");

}

void tvmOutputOfIndex(  tvm::runtime::PackedFunc handler,   /* handle of get_output func  */
                        std::vector<float> &out_data,       /* output vector */
                        std::vector<int> &out_shape,        /* output shape */
                        int output_index){
    // Get Output Result
    tvm::runtime::NDArray res = handler(output_index);
    out_shape.assign(res->shape, res->shape + res->ndim);
    int size = 1;
    for (int i = 0; i < res->ndim; ++i) {
        size *= res->shape[i];
        // std::cout << "shape[" << i << "]=" << out_shape[i] << "\n";
    }
    DLTensor* y;
    TVMArrayAlloc(res->shape, res->ndim, dtype_code, dtype_bits, dtype_lanes, kDLCPU, 0, &y),
    res.CopyTo(y);
    float* dp = (float*) y->data;
    out_data.assign(dp, dp + size);
    TVMArrayFree(y);
}
