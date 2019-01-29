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

void tvm_r100::parse_output(json & res){
    std::vector<float> features;
    std::vector<float> norm_features;
    std::vector<int> output_shape;
    tvmOutputOfIndex(get_output, features, output_shape, 0);

    assert(features.size()==512);

    // vec_norm(features, norm_features);
    float square_sum = 0;
    json feature_array = json::array();
    for(auto feature: features ){
        feature_array.push_back(feature);
        square_sum += feature * feature;
    }
    /*
    std::cout << "norm: " << sqrt(square_sum) << "\n";
    for(auto shape: output_shape)
        std::cout << "shape: " << shape << "\n";
    */
    res["prediction"] = feature_array;

}