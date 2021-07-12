# NANOASM

A tiny configurable assembler for Verilog projects, as described in the book "[Designing Video Game Hardware in Verilog](https://www.amazon.com/gp/product/1728619440/ref=as_li_tl?ie=UTF8&camp=1789&creative=9325&creativeASIN=1728619440&linkCode=as2&tag=pzp-20&linkId=c149f6365c0a676065eb6d7c5f8dd6ae)" and integrated into the [8bitworkshop](https://8bitworkshop.com/) online Verilog IDE.

## Installation

    npm i

## Usage

    node src/asmmain.js <config.json> <file.asm>

Output binary is hex format, one line per word, compatible with Verilog's
`$readmemh` command.

## Examples

    cd examples
    make

## Configuration

NANOASM can translate custom assembly language for Verilog CPUs.
The CPU's language is defined in a a JSON configuration file.

Our assembler's configuration format has a number of rules.
Each rule has a format that matches a line of assembly code, and a bit pattern that is emitted when matched.
For example, this is the rule for the `swapab` instruction:

    {"fmt":"swapab", "bits":["10000001"]},

The "fmt" attribute defines the pattern to be matched, which in this case is just a simple instruction without any operands.

If the rule is matched, the "bits" attribute defines the machine code to be emitted.
This can be a combination of binary constants and variables.
Here we just emit the bits `10000001` -- i.e., the byte `$81`.

Let's say we want to match the following format, `sta <n>` where `<n>` is a variable 4-bit operand:

	sta [0-15]	; 4-bit constant

We can specify different types of variables in the \textbf{vars} section of the configuration file.
For example, this defines a 4-bit variable named `const4`:

    "const4":{"bits":4}

The assembler rules are big-endian by default (most significant bits first) so if
you need constants larger than a single machine word, set the "endian"
property:

    "abs16":{"bits":16,"endian":"little"}

To include a variable in a rule, prefix the variable's name with a tilde (\textasciitilde).
For example, our `sta` rule takes one `~const4` variable:

    {"fmt":"sta ~const4", "bits":["1001",0]},

We also have to include the value of the variable in the instruction encoding.
To do this, we put an integer into the "bits" array -- 0 for the first variable, 1 for the second, etc.

An example: The assembler is given the instruction `sta 15`.
It matches the rule `sta ~const4`, and assigns 15 to the first variable slot.
It then outputs the the bits `1001` and then the 4-bit value 15, or `1111`.
The final opcode is `10011111` or `$9f`.

Instead of a single integer index, you can emit a slice of bits.
This comes in handy for instruction sets where values are not contiguous,
for example RISC-V:

    // for argument 1, take 7 bits starting at index 5, then 5 bits starting
    // at index 0
    // {a = argument index, b = bit index, n = number of bits}
    {"fmt":"sb ~reg,~imm12(~reg)",   "bits":[{"a":1,"b":5,"n":7},2,0,"000",{"a":1,"b":0,"n":5},"0100011"]},


## Tokens

Variables can also be defined by tokens.
For example, the following rule defines a variable `reg` with four possible values -- `a`, `b`, `ip`, or `none`, encoded as two bits:

    "reg":{"bits":2, "toks":["a", "b", "ip", "none"]},

Here's an example of a rule that uses it:

    {"fmt":"mov ~reg,[b]", "bits":["11",0,"1011"]},

When decoding `mov a,[b]`, the assembler sees that `a` is the first token in the variable, and substitutes the bit pattern `00`.
The final bit pattern is `11` `00` `1011` which makes a full byte.

More complex instructions are possible, by using multiple variables in a single rule:

    {"fmt":"~binop ~reg,#~imm8", "bits":["01",1,"1",0,2]},

In this rule, `binop`, `reg`, and `imm8` (2) are variables, identified by the integers 0, 1, and 2.
`add b,#123` is an example of a matching instruction.
This rule emits an opcode 16 bits (two bytes) long.

## Directives

NANOASM supports these directives:

`.arch <arch>` -- Required. Loads the file `<arch>.json` and configures the assembler.

`.org <address>` -- The start address of the ROM, as seen by the CPU.

`.len <length>` -- The length of the ROM file output by the assembler.

`.width <value>` -- Specify the size in bits of an machine word. Default = 8.

`.define <label> <value>` -- Define a label with a given numeric value.

`.data $aa $bb ...` -- Includes raw data in the output.

`.string .....` -- Converts a string to machine words, then includes it in the output.

`.align <value>` -- Align the current IP to a multiple of `<value>`.

# LICENSE

MIT
