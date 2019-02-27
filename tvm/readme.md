# Http结果码
- 200 OK，返回json array，每个entry的定义：

    {

       "age":43,  
       
       "embedding":"rOIc/aAXcP00dEr8=......",
       
       "filename":"test2_1.jpg",
       
       "gender":0,
       
       "pose_type":0,
       
       "state":0,

       "quality":0.9303406476974487,
       
       "comment":"embedding为base64编码的512长度的float数组，
                  
                  state为0时表示结果成功：
                  
                  state不为0表示错误码，没有embedding字段，会增加一个error字段描述错误"
      
      }
      
     处理失败的entry
     
     {
      
      "error":"face pose skew",
      
      "filename":"test3_2.jpg",
      
      "pose_type":3,
      
      "state":-7
      
     }
- 非200 OK，返回消息体为json object，result_info字段描述错误原因：

     {
  
        "result_info":"can not found content-length in header"

     }

# state结果码说明:

state | error
------|-----------------------------------------------------------
-1    | input image size too small  
-2    | detect no face  
-3    | detect more than one face 
-4    | face area is tool small
-5    | failed to find similar transform matrix for face alignment
-6    | opencv exception
-7    | face pose skew
-8    | face norm[] is too small
