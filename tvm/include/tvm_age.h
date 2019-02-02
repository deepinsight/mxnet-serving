#ifndef __TVM_AGE__
#define __TVM_AGE__

#include "tvm_model.h"

class tvm_age: public tvm_model{
public:
    tvm_age(std::string path, std::string name, std::string hardware, 
                                int w, int h, int batch=1, int mode=0, int devid=0):
                    tvm_model(path, name, hardware, w, h, batch, mode, devid){}
    int get_age();
};

#endif