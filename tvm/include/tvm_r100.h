#ifndef __TVM_R100__
#define __TVM_R100__

#include "tvm_model.h"

class tvm_r100: public tvm_model{
public:
    tvm_r100(std::string path, std::string name, std::string hardware, 
                                int w, int h, int batch=1, int mode=0, int devid=0):
                    tvm_model(path, name, hardware, w, h, batch, mode, devid){}
    void parse_output(std::vector<float> & features);
    float get_norm   (std::vector<float> & in);
};

#endif