#include <vector>
#include <functional>

template<typename T>
inline void argsort( std::vector<int> & idx, const std::vector<T>& v){
    int Len = v.size();
    idx.resize(Len);
    for(int i = 0; i < Len; i++){
            idx[i] = i;
    }
    std::sort(idx.begin(), idx.end(), [&v](int i1, int i2){return v[i1] > v[i2];});
}

template<typename T>
inline void filter_threshold( std::vector<bool> & idx, const std::vector<T> & v, const T threshold){
    int Len = v.size();
    idx.resize(Len);
    for(size_t i=0;i<Len;i++){
        if( v[i] >= threshold ){
            idx[i] = true;
        } 
        else 
            idx[i] = false;
    }
}

template<typename T>
inline void tensor_slice(std::vector<T> & tensor1, std::vector<T> & tensor2, 
                         std::vector<bool> & idx, int stride) {
    tensor2.clear();
    for(size_t i=0; i<idx.size(); i++)
        if(idx[i]==true)
            for(int j=0;j<stride;j++)
                tensor2.push_back(tensor1[stride*i+j]);
}

template<typename T>
inline void sort_with_idx(std::vector<T> & tensor1, std::vector<T> & tensor2, 
                          std::vector<int> & idx, int stride){
    for(size_t i=0; i<idx.size(); i++)
        for(int j=0;j<stride;j++)
            tensor2.push_back(tensor1[idx[i]*stride +j]);
}

inline void tensor_reshape(std::vector<float> & tensor1, std::vector<float> & tensor2, int h, int w){

    int d1 = h * w;
    int d2 = tensor1.size()/d1;
    tensor2.resize(tensor1.size());

    for(size_t i = 0; i< d2; i++)
        for(size_t j = 0; j< d1; j++)
            tensor2[i+j*d2] = tensor1[i*d1+j];
}

inline void tensor_reshape(std::vector<float> & tensor1, std::vector<float> & tensor2, int H, int W, int c)
{

    int d1 = H * W;
    int d2 = tensor1.size() / d1 / c;
    tensor2.resize(tensor1.size());

    if (c == 1)
    {
        for (int i = 0; i < d2; ++i)
        {
            for (int j = 0; j < d1; ++j)
            {
                tensor2[i + j * d2] = tensor1[i * d1 + j];
            }
        }
    }
    else
    {
        for (int i = 0; i < d2; ++i)
        {
            for (int j = 0; j < d1; ++j)
            {
                int base1 = (i * d1 + j) * c;
                int base2 = (i + j * d2) * c;
                for (int k = 0; k < c; ++k)
                {
                    tensor2[base2 + k] = tensor1[base1 + k];
                }
            }
        }
    }
}
