#include "tvm_r100.h"
#include "math.h"

void vec_norm(std::vector<float> &in, std::vector<float> &out){
  float sqare_sum=0;
  for(size_t i=0;i<in.size();i++){
    sqare_sum += in[i]*in[i];
  }
  float magnititue = sqrt(sqare_sum);
  out.resize(in.size());
  for(size_t i=0;i<out.size();i++){
    out[i] = in[i] / magnititue;
  }
}

float tvm_r100::get_norm(std::vector<float> & in) {
  float sqare_sum=0;
  for(size_t i=0;i<in.size();i++){
    sqare_sum += in[i]*in[i];
  }
  return sqrt(sqare_sum);
}

void tvm_r100::parse_output(std::vector<float> & features){
    features.clear();
    // std::vector<float> norm_features;
    std::vector<int> output_shape;
    tvmOutputOfIndex(get_output, features, output_shape, 0);
    assert(features.size()==512);
}