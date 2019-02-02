#include "tvm_age.h"

int tvm_age::get_age(){
    std::vector<float> output_data;
    // std::vector<float> norm_features;
    std::vector<int> output_shape;
    tvmOutputOfIndex(get_output, output_data, output_shape, 0);
    return output_data[0];
}