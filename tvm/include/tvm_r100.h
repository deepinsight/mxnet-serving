#ifndef __TVM_R100__
#define __TVM_R100__

#include "tvm_model.h"

class tvm_r100: public tvm_model{
public:
    tvm_r100(std::string path, std::string name, std::string cpu, int w, int h, int batch=1):
                    tvm_model(path, name, cpu, w, h, 1){}
    virtual void parse_output(json & res);
};

#endif