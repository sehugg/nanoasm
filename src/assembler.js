"use strict";
exports.__esModule = true;
var isError = function (o) { return o.error !== undefined; };
function hex(v, nd) {
    try {
        if (!nd)
            nd = 2;
        var s = v.toString(16).toUpperCase();
        while (s.length < nd)
            s = "0" + s;
        return s;
    }
    catch (e) {
        return v + "";
    }
}
function stringToData(s) {
    var data = [];
    for (var i = 0; i < s.length; i++) {
        data[i] = s.charCodeAt(i);
    }
    return data;
}
var Assembler = /** @class */ (function () {
    function Assembler(spec) {
        this.ip = 0;
        this.origin = 0;
        this.linenum = 0;
        this.symbols = {};
        this.errors = [];
        this.outwords = [];
        this.asmlines = [];
        this.fixups = [];
        this.width = 8;
        this.codelen = 0;
        this.aborted = false;
        this.spec = spec;
        if (spec) {
            this.preprocessRules();
        }
    }
    Assembler.prototype.rule2regex = function (rule, vars) {
        var s = rule.fmt;
        if (!s || !(typeof s === 'string'))
            throw Error('Each rule must have a "fmt" string field');
        if (!rule.bits || !(rule.bits instanceof Array))
            throw Error('Each rule must have a "bits" array field');
        var varlist = [];
        rule.prefix = s.split(/\s+/)[0];
        s = s.replace(/\+/g, '\\+');
        s = s.replace(/\*/g, '\\*');
        s = s.replace(/\s+/g, '\\s+');
        s = s.replace(/\[/g, '\\[');
        s = s.replace(/\]/g, '\\]');
        s = s.replace(/\./g, '\\.');
        // TODO: more escapes?
        s = s.replace(/~\w+/g, function (varname) {
            varname = varname.substr(1);
            var v = vars[varname];
            varlist.push(varname);
            if (!v)
                throw Error('Could not find variable definition for "~' + varname + '"');
            else if (v.toks)
                return '(\\w+)';
            else
                return '([0-9]+|[$][0-9a-f]+|\\w+)';
        });
        try {
            rule.re = new RegExp('^' + s + '$', 'i');
        }
        catch (e) {
            throw Error("Bad regex for rule \"" + rule.fmt + "\": /" + s + "/ -- " + e);
        }
        rule.varlist = varlist;
        // TODO: check rule constraints
        return rule;
    };
    Assembler.prototype.preprocessRules = function () {
        if (this.spec.width) {
            this.width = this.spec.width | 0;
        }
        for (var _i = 0, _a = this.spec.rules; _i < _a.length; _i++) {
            var rule = _a[_i];
            this.rule2regex(rule, this.spec.vars);
        }
    };
    Assembler.prototype.warning = function (msg, line) {
        this.errors.push({ msg: msg, line: line ? line : this.linenum });
    };
    Assembler.prototype.fatal = function (msg, line) {
        this.warning(msg, line);
        this.aborted = true;
    };
    Assembler.prototype.fatalIf = function (msg, line) {
        if (msg)
            this.fatal(msg, line);
    };
    Assembler.prototype.addBytes = function (result) {
        this.asmlines.push({
            line: this.linenum,
            offset: this.ip,
            nbits: result.nbits
        });
        var op = result.opcode;
        var nb = result.nbits / this.width;
        for (var i = 0; i < nb; i++) {
            this.outwords[this.ip++ - this.origin] = (op >> (nb - 1 - i) * this.width) & ((1 << this.width) - 1);
        }
    };
    Assembler.prototype.addWords = function (data) {
        this.asmlines.push({
            line: this.linenum,
            offset: this.ip,
            nbits: this.width * data.length
        });
        for (var i = 0; i < data.length; i++) {
            this.outwords[this.ip++ - this.origin] = data[i] & ((1 << this.width) - 1);
        }
    };
    Assembler.prototype.parseData = function (toks) {
        var data = [];
        for (var i = 0; i < toks.length; i++) {
            data[i] = this.parseConst(toks[i]);
        }
        return data;
    };
    Assembler.prototype.alignIP = function (align) {
        if (align < 1 || align > this.codelen)
            this.fatal("Invalid alignment value");
        else
            this.ip = Math.floor((this.ip + align - 1) / align) * align;
    };
    Assembler.prototype.parseConst = function (s, nbits) {
        // TODO: check bit length
        if (s && s[0] == '$')
            return parseInt(s.substr(1), 16);
        else
            return parseInt(s);
    };
    Assembler.prototype.buildInstruction = function (rule, m) {
        var opcode = 0;
        var oplen = 0;
        // iterate over each component of the rule output ("bits")
        for (var _i = 0, _a = rule.bits; _i < _a.length; _i++) {
            var b = _a[_i];
            var n, x;
            // is a string? then it's a bit constant
            // TODO
            if (typeof b == "string") {
                n = b.length;
                x = parseInt(b, 2);
            }
            else {
                // it's an indexed variable, look up its variable
                var id = m[b + 1];
                var v = this.spec.vars[rule.varlist[b]];
                if (!v) {
                    return { error: "Could not find matching identifier for '" + m[0] + "'" };
                }
                n = v.bits;
                // is it an enumerated type? look up the index of its keyword
                if (v.toks) {
                    x = v.toks.indexOf(id);
                    if (x < 0)
                        return { error: "Can't use '" + id + "' here, only one of: " + v.toks.join(', ') };
                }
                else {
                    // otherwise, parse it as a constant
                    x = this.parseConst(id, n);
                    // is it a label? add fixup
                    if (isNaN(x)) {
                        this.fixups.push({ sym: id, ofs: this.ip, bitlen: n, bitofs: oplen, line: this.linenum, iprel: !!v.iprel, ipofs: (v.ipofs + 0) });
                        x = 0;
                    }
                }
            }
            var mask = (1 << n) - 1;
            if ((x & mask) != x)
                return { error: "Value " + x + " does not fit in " + n + " bits" };
            opcode = (opcode << n) | x;
            oplen += n;
        }
        if (oplen == 0)
            this.warning("Opcode had zero length");
        else if (oplen > 32)
            this.warning("Opcodes > 32 bits not supported");
        else if ((oplen % this.width) != 0)
            this.warning("Opcode was not word-aligned (" + oplen + " bits)");
        return { opcode: opcode, nbits: oplen };
    };
    Assembler.prototype.loadArch = function (arch) {
        if (this.loadJSON) {
            var json = this.loadJSON(arch + ".json");
            if (json && json.vars && json.rules) {
                this.spec = json;
                this.preprocessRules();
            }
            else {
                return ("Could not load arch file '" + arch + ".json'");
            }
        }
    };
    Assembler.prototype.parseDirective = function (tokens) {
        var cmd = tokens[0].toLowerCase();
        if (cmd == '.define')
            this.symbols[tokens[1].toLowerCase()] = { value: tokens[2] };
        else if (cmd == '.org')
            this.ip = this.origin = parseInt(tokens[1]);
        else if (cmd == '.len')
            this.codelen = parseInt(tokens[1]);
        else if (cmd == '.width')
            this.width = parseInt(tokens[1]);
        else if (cmd == '.arch')
            this.fatalIf(this.loadArch(tokens[1]));
        else if (cmd == '.include')
            this.fatalIf(this.loadInclude(tokens[1]));
        else if (cmd == '.module')
            this.fatalIf(this.loadModule(tokens[1]));
        else if (cmd == '.data')
            this.addWords(this.parseData(tokens.slice(1)));
        else if (cmd == '.string')
            this.addWords(stringToData(tokens.slice(1).join(' ')));
        else if (cmd == '.align')
            this.alignIP(this.parseConst(tokens[1]));
        else
            this.warning("Unrecognized directive: " + tokens);
    };
    Assembler.prototype.assemble = function (line) {
        var _this = this;
        this.linenum++;
        // remove comments
        line = line.replace(/[;].*/g, '').trim();
        // is it a directive?
        if (line[0] == '.') {
            var tokens = line.split(/\s+/);
            this.parseDirective(tokens);
            return;
        }
        // make it lowercase
        line = line.toLowerCase();
        // find labels
        line = line.replace(/(\w+):/, function (_label, label) {
            _this.symbols[label] = { value: _this.ip };
            return ''; // replace label with blank
        });
        line = line.trim();
        if (line == '')
            return; // empty line
        // look at each rule in order
        if (!this.spec) {
            this.fatal("Need to load .arch first");
            return;
        }
        var lastError;
        for (var _i = 0, _a = this.spec.rules; _i < _a.length; _i++) {
            var rule = _a[_i];
            var m = rule.re.exec(line);
            if (m) {
                var result = this.buildInstruction(rule, m);
                if (!isError(result)) {
                    this.addBytes(result);
                    return result;
                }
                else {
                    lastError = result.error;
                }
            }
        }
        this.warning(lastError ? lastError : ("Could not decode instruction: " + line));
    };
    Assembler.prototype.finish = function () {
        // apply fixups
        for (var i = 0; i < this.fixups.length; i++) {
            var fix = this.fixups[i];
            var sym = this.symbols[fix.sym];
            if (sym) {
                var ofs = fix.ofs + Math.floor(fix.bitofs / this.width);
                var shift = fix.bitofs & (this.width - 1);
                var mask = ((1 << fix.bitlen) - 1);
                var value = this.parseConst(sym.value + "", fix.bitlen);
                if (fix.iprel)
                    value -= fix.ofs + fix.ipofs;
                if (value > mask || value < -mask)
                    this.warning("Symbol " + fix.sym + " (" + value + ") does not fit in " + fix.bitlen + " bits", fix.line);
                value &= mask;
                // TODO: check range
                // TODO: span multiple words?
                this.outwords[ofs - this.origin] ^= value; // TODO: << shift?
            }
            else {
                this.warning("Symbol '" + fix.sym + "' not found");
            }
        }
        // update asmlines
        for (var i = 0; i < this.asmlines.length; i++) {
            var al = this.asmlines[i];
            al.insns = '';
            for (var j = 0; j < al.nbits / this.width; j++) {
                var word = this.outwords[al.offset + j - this.origin];
                if (j > 0)
                    al.insns += ' ';
                al.insns += hex(word, this.width / 4);
            }
        }
        while (this.outwords.length < this.codelen) {
            this.outwords.push(0);
        }
        this.fixups = [];
        return this.state();
    };
    Assembler.prototype.assembleFile = function (text) {
        var lines = text.split(/\n/g);
        for (var i = 0; i < lines.length && !this.aborted; i++) {
            try {
                this.assemble(lines[i]);
            }
            catch (e) {
                console.log(e);
                this.fatal("Exception during assembly: " + e);
            }
        }
        return this.finish();
    };
    Assembler.prototype.state = function () {
        return { ip: this.ip, line: this.linenum, origin: this.origin, codelen: this.codelen,
            intermediate: {},
            output: this.outwords,
            lines: this.asmlines,
            errors: this.errors,
            fixups: this.fixups };
    };
    return Assembler;
}());
exports.Assembler = Assembler;
