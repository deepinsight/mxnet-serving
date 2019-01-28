#include "tvm_r100.h"
#include <unistd.h>
#include <thread>
using namespace cv;
using namespace std;

string path;
string name;
string cpu;
string input;

void f(){
    tvm_model * handle3 = new tvm_r100(path, name, cpu, 112, 112);
    sleep(1);
    delete handle3;
}

int main(int argc, char* argv[]){

    const String keys =
        "{help h usage ?     |                    | print this message }"
        "{path               |/Users/load/code/python/infinivision/tvm-convert/tvm-model | local_id config file }"
        "{name               |r100                | model name }"
        "{cpu                |skylake             | cpu architect family name }"
        "{input              |test.jpg            | input image for test }"

    ;
    CommandLineParser parser(argc, argv, keys);
    parser.about("tvm model infer test case");
    if (parser.has("help")) {
        parser.printMessage();
        return 0;
    }

    path = parser.get<String>("path");
    name = parser.get<String>("name");
    cpu  = parser.get<String>("cpu");
    input  = parser.get<String>("input");

    Mat ori_img = imread(input);

    Mat img;

    tvm_model *handle,*handle2 = nullptr;
    if( name=="r100" ){
        resize(ori_img,img,cv::Size(112,112));
        handle = new tvm_r100(path, name, cpu, 112, 112);
        handle->infer(img);
        
        json features;
        handle->parse_output(features);

        std::cout << "feature json: " << features.dump() << "\n";

        handle2 = new tvm_r100(path, name, cpu, 112, 112);
        std::thread sub_thread(f);

        delete handle;
        delete handle2;
        sub_thread.join();
    }

}
