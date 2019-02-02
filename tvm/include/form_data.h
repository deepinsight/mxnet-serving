#ifndef __FORM__DATA__
#define __FORM__DATA__
#include "MultipartParser.h"

#include <stdio.h>
#include <string>
#include <map>
#include <iostream>

#include <boost/algorithm/string.hpp>

static void onPartBegin(const char *buffer, size_t start, size_t end, void *userData);
static void onHeaderField(const char *buffer, size_t start, size_t end, void *userData);
static void onHeaderValue(const char *buffer, size_t start, size_t end, void *userData);
static void onPartData(const char *buffer, size_t start, size_t end, void *userData);
static void onPartEnd(const char *buffer, size_t start, size_t end, void *userData);
static void onEnd(const char *buffer, size_t start, size_t end, void *userData);

struct formFieldValue {
    std::string field;
    std::string value;
};

struct formData {
    enum Type {
        JPEG,
        OTHER
    };
    formFieldValue fv;
    Type type = Type::OTHER;
    std::map<std::string, std::string> disposition;
    std::string data;
};

class formDataParser {
public:
    enum State {
        Success,
        FormDataParseError,
        DispositionParseError,
        ContentFormtError,
        ContentNameError,
        ContentNoFileNameError
    };
    formDataParser(const char * data_, size_t len_, std::string boundary): 
                             parser(boundary), data(data_),len(len_){
        parser.onPartBegin   = onPartBegin;
        parser.onHeaderField = onHeaderField;
        parser.onHeaderValue = onHeaderValue;
        parser.onPartData    = onPartData;
        parser.onPartEnd     = onPartEnd;
        parser.onEnd         = onEnd;
        parser.userData = (void *) this;
        parser.feed(data,len);
    }

	bool succeeded() const {
		return (state==Success);
	}

	std::string getErrorMessage() const {
        if(state==FormDataParseError)
		    return std::string(parser.getErrorMessage());
        if(state==DispositionParseError)
		    return "form content disposition parse error: " + error_info;            
        else if(state==ContentFormtError)
            return "form content type error, only support image/jpeg";
        else if(state==ContentNameError)
            return "form content name error, only support name=data";
        else if(state==ContentNoFileNameError)
            return "no filename in content disposition";
        else
            return "no error";
	}

    std::vector<formData> fds;
    State state = Success;
    std::string error_info;

private:
    MultipartParser parser;
    const char * data;
    const size_t len;

};

static void
onPartBegin(const char *buffer, size_t start, size_t end, void *userData) {
    // printf("onPartBegin\n");
    formDataParser *fdparser = (formDataParser *) userData;
    fdparser->fds.push_back(formData());
}

static void
onHeaderField(const char *buffer, size_t start, size_t end, void *userData) {
    // printf("onHeaderField: (%s)\n", std::string(buffer + start, end - start).c_str());
    formDataParser *fdparser = (formDataParser *) userData;
    size_t index = fdparser->fds.size()-1;
    fdparser->fds[index].fv.field = std::string(buffer + start, end - start);
}

bool parse_disposition(std::string & disp, std::map<std::string, std::string> & fvs) {
    std::vector<std::string> entrys;
    boost::split(entrys, disp, boost::is_any_of(";"));
    for(auto & entry: entrys) {
        // std::cout << "entry: " << entry << "\n";
        std::vector<std::string> tokens;
        boost::split(tokens, entry, boost::is_any_of("="));
        if(tokens.size()!=2){
            std::cout << "tokens.size()!=2\n";
            return false;
        }
        for(auto & token: tokens){
            // std::cout << "token before replace: " << token << "\n";
            boost::replace_all(token, "\""," ");
            boost::trim(token);
            // std::cout << "token after trim: " << token << "\n";
            if(token.length()==0){
                std::cout << "token length is 0\n";
                return false;
            }
            // std::cout << "token: " << token << "\n";
        }
        fvs[tokens[0]] = tokens[1];
    }
    return true;
}

static void
onHeaderValue(const char *buffer, size_t start, size_t end, void *userData) {
    // printf("onHeaderValue: (%s)\n", std::string(buffer + start, end - start).c_str());
    formDataParser *fdparser = (formDataParser *) userData;
    size_t index = fdparser->fds.size()-1;
    formData & fd = fdparser->fds[index];
    fd.fv.value = std::string(buffer + start, end - start);
    if(fd.fv.field == "Content-Type")
        if(fd.fv.value == "image/jpeg")
            fd.type = formData::Type::JPEG;
        else {
            fdparser->state = formDataParser::State::ContentFormtError;
            return;
        }
    else if(fd.fv.field == "Content-Disposition") {
        std::string disp = fd.fv.value;
        auto disp_start = disp.find("form-data;");
        if(disp_start!=0){
            fdparser->state = formDataParser::State::DispositionParseError;
            fdparser->error_info = "can't find form-data; at the beginning";
            return;
        }
        disp = disp.substr(10,disp.length());
        if(!parse_disposition(disp, fd.disposition)){
            fdparser->state = formDataParser::State::DispositionParseError;
            return;
        }
        if(fd.disposition["name"]!="data"){
            fdparser->state = formDataParser::State::ContentNameError;
            return;
        }
        if(fd.disposition.find("filename")==fd.disposition.end()){
            fdparser->state = formDataParser::State::ContentNoFileNameError;
            return;
        }
    }
}

static void
onPartData(const char *buffer, size_t start, size_t end, void *userData) {
    // printf("onPartData: data length: %lu\n", end-start);
    formDataParser *fdparser = (formDataParser *) userData;
    size_t index = fdparser->fds.size()-1;
    fdparser->fds[index].data.append(std::string(buffer + start, end - start));
}

static void
onPartEnd(const char *buffer, size_t start, size_t end, void *userData) {
    // printf("onPartEnd\n");
}

static void
onEnd(const char *buffer, size_t start, size_t end, void *userData) {
    // printf("onEnd\n");
}

#endif