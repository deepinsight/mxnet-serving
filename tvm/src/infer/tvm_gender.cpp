#include "tvm_gender.h"
#include "math.h"

int tvm_gender::get_gender(){
    std::vector<float> output_data;
    // std::vector<float> norm_features;
    std::vector<int> output_shape;
    tvmOutputOfIndex(get_output, output_data, output_shape, 0);
    if(output_data[0]>output_data[1])
        return 0;
    else
        return 1;
}