.arch femto8
.org 128
.len 128
      
Start:
      zero A	; A <= 0
      ldb #1	; B <= 1
Loop:
      add A,B	; A <= A + B
      swapab	; swap A,B
      bcc Loop	; repeat until carry set
      reset	; end of loop; reset CPU
