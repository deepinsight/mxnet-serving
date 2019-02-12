#include "tvm_gender.h"
#include "tvm_age.h"
#include <unistd.h>
#include <thread>
using namespace cv;
using namespace std;

string path;
string cpu;
string image;

int main(int argc, char* argv[]){

    const String keys =
        "{help h usage ?     |                    | print this message }"
        "{path               |/Users/load/code/python/infinivision/tvm-convert/tvm-model | local_id config file }"
        "{cpu                |skylake             | cpu architect family name }"
        "{image              |test.jpg            | image file path }"
        
    ;
    CommandLineParser parser(argc, argv, keys);
    parser.about("tvm model gender-age infer test case");
    if (parser.has("help")) {
        parser.printMessage();
        return 0;
    }

    path = parser.get<String>("path");
    cpu  = parser.get<String>("cpu");
    image  = parser.get<String>("image");

    Mat img = imread(image);
    assert(img.channels()==3);
    assert(img.cols==112&&img.rows==112);
    tvm_gender gender(path,"gender_slim",cpu,112,112);
    gender.infer(img);
    std::cout << "gender: " << gender.get_gender() << "\n";

    tvm_age age(path,"age_slim",cpu,112,112);
    age.infer(img);
    std::cout << "age: " << age.get_age() << "\n";

}
