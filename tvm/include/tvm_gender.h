#ifndef __TVM_GENDER__
#define __TVM_GENDER__

#include "tvm_model.h"

class tvm_gender: public tvm_model{
public:
    tvm_gender(std::string path, std::string name, std::string hardware, 
                                int w, int h, int batch=1, int mode=0, int devid=0):
                    tvm_model(path, name, hardware, w, h, batch, mode, devid){}
    int get_gender();
};

#endif