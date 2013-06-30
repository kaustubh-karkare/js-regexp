
// Convenience Functions

Array.prototype.last = function(value,add){
	switch(arguments.length){
		case 0: return this[this.length-1];
		case 1: return this[this.length-1] = value;
		case 2: return this[this.length-1]+= value;
	}
};

Array.prototype.repeat = function(number){
	var result = [];
	while(number--) result = result.concat(this);
	return result;
};

Array.prototype.add = function(){
	for(var i=0; i<arguments.length; ++i)
		this.push(arguments[i]);
	return this;
};

Object.prototype.clone = function(){
	return JSON.parse(JSON.stringify(this));
};

Object.prototype.equals = function(that){
	return JSON.stringify(this)===JSON.stringify(that);
}

Object.prototype.json = function(){
	return JSON.stringify(this);
};





var RegExp2 = (function(){

var log = false;

var special = "\\.|?+*()[^-]{,}$".split("");

// Character codes for whitespace characters
var whitespace = { "f":0x000C, "n":0x000A, "r":0x000D, "t":0x0009, "v":0x000B };

var check = {

	// Is the given character a digit?
	"d" : function(c){
		var cc = c.charCodeAt(0);
		return 48<=cc && cc<=57;
	},

	// Is the given character alphanumeric?
	"w" : function(c){
		var cc = c.charCodeAt(0);
		return 48<=cc && c<=58 || 65<=cc && cc<=90 || 97<=cc && cc<=122 || cc===95;
	},

	// Does the given character qualify as whitespace?
	"s" : function(c){
		return "\f\n\r\t\v​\u00a0\u1680​\u180e\u2000​\u2001\u2002​\u2003\u2004​\u2005\u2006​\u2007\u2008​\u2009\u200a​\u2028\u2029​​\u202f\u205f​\u3000".indexOf(c)!==-1;
	},

	// Is the given character anything other than a newline character?
	"." : function(c){
		return c!=="\n";
	}
};





// A Token is the smallest unit of a pattern, which corresponds to either one or
// two characters (in case of escaped character) from the RegExp source string.
var Token = function(value,operator,escape){
	if(typeof(value)!=="string" || value.length!==1) throw new Error("Invalid Token Value");
	this.value = value;
	this.operator = !!operator;
	this.escape = !!escape;
};

// Checks if the Token satisfies the given requirements.
// If an argument is not provided it is not checked.
Token.prototype.match = function(value,operator,escape){
	var result = true;
	switch(arguments.length){
		default: result = false;
		case 3: result &= this.escape==escape;
		case 2: result &= this.operator==operator;
		case 1: result &= this.value===value;
	}
	return result;
};





// A State object is passed around by the Nodes during RegExp Matching.
var State = function(pattern,string){
	this.ignoreCase = pattern.ignoreCase;
	this.multiline = pattern.multiline;
	this.string = string;

	this.index = 0; // The next position in the string to be matched.
	this.local = []; // Each object in this stack contains variables local to the matching process of a specific node.
	this.save = [null].repeat(pattern.group+1); // This array of strings will contain the matched groups.
	this.start = false; // Has the first character been matched yet?
	this.end = false; // Has the last character been matched yet?

	this.alternative = []; // In case of a choice during matching, the next alternative is pushed into this stack so that it may be restored if required.
	this.move = []; // Used during backtracking, this array contains data used to return to the last alternative point.
};

State.prototype.str_next = function(){
	return this.string[this.index++];
};

State.prototype.str_peek = function(){
	return this.string[this.index];
};

// Saves the next alternative state which may be restored if a mismatch occurs later.
State.prototype.remember = function(){
	this.alternative.push({
		"index": this.index,
		"local": this.local.clone(),
		"save": this.save.clone(),
		"start": this.start,
		"end": this.end
	});
	if(log) console.log("Remember",this.alternative.last().json());
};


// Loads the last alternative state, being restored due to a subsequent mismatch.
State.prototype.restore = function(){
	if(!this.alternative.last()) return;
	var dlast = this.alternative.pop();
	this.index = dlast.index;
	this.save = dlast.save;
	this.start = dlast.start;
	this.end = dlast.end;
	if(log) console.log("Restore",dlast.json());
};

// To be called when a mismatch occurs.
// The move array is filled with instructions to return to the last alternative state
State.prototype.mismatch = function(){
	var ll = this.local.length;
	if(this.alternative.length===0){
		this.move = [null].repeat(ll); // No alternatives were made before this. The match process fails completely.
	} else {
		// Determine the length of the path from the root node common to this point and the last alternative point.
		var dlast = this.alternative.last();
		for(var i=0; i<ll; ++i)
			if(!this.local[i].equals(dlast.local[i])) break;
		// Each null results in an upward movement, and so insert as many required to reach the common ancestor.
		this.move = [null].repeat(i<ll ? ll-i : 0);
		// Each non-null results in a downward movement, and so insert all local variable objects beyond the common ancestor.
		this.move.add.apply(this.move,dlast.local.slice(i));
		// Special Case: alternative was just made by the current node. Based on assumption that parent exists.
		if(this.move.length===0) this.move = [null,dlast.local.last()];
	}
	if(log) console.log("Mismatch, Redirection Initiated.");
	return this.error_redirect(); // Should be null, since a mismatch will always occur at a leaf node.
};

/*
Provides redirection information and facilitates state restoration.
If redirection is ongoing, this function may return either the saved object containing the
local variables to match the next alternative (thereby moving downwards) or null, encountering
which the calling function must return immediately (moving upwards).
If redirection is not going on, then the data provided as the argument is returned. This data
is supposed to be a local variables object containing initial values (to be used for the first
time the node is being encountered at this position).
*/
State.prototype.error_redirect = function(data){
	if(this.move.length===1) this.restore(); // If the next node is the last alternative point, restore state.
	if(log){
		if(this.move.length===1) console.log("Redirection Complete.");
		else if(this.move.length>1) console.log("Redirection Ongoing",this.move.json());
	}
	return this.move.length ? this.move.shift() : data;
};

// Terminates the redirection process initiated due to a mismatch.
State.prototype.error_ignore = function(){
	this.move = [];
	if(log) console.log("Redirection Terminated.");
};





// A Pattern is the container object for the source string, with additional data items used during
// the generation of the internal tree representation of the RegExp.
var Pattern = function(source,flags){

	if(typeof(source)!=="string") throw new Error("Pattern String Not Provided");
	this.source = source;

	flags = flags || "";
	this.global = (flags.indexOf("g")!==-1);
	this.multiline = (flags.indexOf("m")!==-1);
	this.ignoreCase = (flags.indexOf("i")!==-1);

	this.index = 0; // The next position in the source string, used while creating Tokens.
	this.buffer = []; // A Queue that will contain Tokens generated from the source string.
	this.group = 0; // The index of the next saved group, used to specify the position in the results array.

	this.node = this.And(); // Generate the internal tree structure based on the Tokens generated from the source string.
};

// Escapes all special characters in the string.
Pattern.escape = function(str){
	for(var i=0; i<special.length; ++i)
		str = str.replace(special[i],"\\"+special[i]);
	return str;
};

// Reads one or two characters from the source string and generates a new Token.
// Returns whether or not a new Token was pushed into the buffer.
Pattern.prototype.token_load = function(){
	if(this.index>=this.source.length) return false;
	var c = this.source[this.index++];
	if(c==="\\")
		if(this.index>=this.source.length) throw new Error("Unexpected End of Pattern");
		else this.buffer.push(new Token(this.source[this.index++],false,true));
	else if(special.indexOf(c)!==-1) this.buffer.push(new Token(c,true));
	else this.buffer.push(new Token(c,false));
	return true;
};

// Returns the next Token in the buffer, now removed.
Pattern.prototype.token_next = function(){
	if(this.buffer.length===0) this.token_load(); // Load the next token if required.
	return this.buffer.length ? this.buffer.shift() : null;
};

// Returns the Token at the specified position from the start of buffer.
Pattern.prototype.token_peek = function(position){
	var d = position || 1;
	while(this.buffer.length<d && this.token_load()); /* Keep loading until the required Token comes into the buffer. */
	return this.buffer.length===d ? this.buffer[d-1] : null;
};

// Reads the specified number of hexadecimal characters from the source string and returns the numerical value.
Pattern.prototype.hex_read = function(length){
	var result = 0, c = this.token_next();
	for(var i=0;i<length;++i){
		c = this.token_next();
		if(!c) throw new Error("Unexpected End of Pattern");
		cc = c.value.toUpperCase().charCodeAt();
		if(48<=cc<=57 || 65<=cc<=70) result = result*16+(cc<58?cc-48:cc-55);
		else throw new Error("Unexpected Character");
	}
	return result;
};

// Matches the given string with the current pattern.
Pattern.prototype.exec = function(string){
	var state, result = null;
	for(var i=this.global && this.lastIndex || 0; i<string.length; ++i){
		state = new State(this,string)
		state.index = i;
		result = this.node.match(state);
		if(result!==null) break;
	}
	if(result!==null){
		if(this.global) this.lastIndex = state.index; /* if global, set lastIndex so that next search begins after current match */
		state.save[0] = result;
		state.save.index = state.index-result.length; /* index from which the current match starts */
		state.save.input = string;
		return state.save;
	} else {
		if(this.global && this.lastIndex===string.length) this.lastIndex = 0; /* if global and the entire string has been scanned, reset index */
		return null;
	}
};





var Node = function(name, constructor, match){
	var a = constructor;
	a.prototype.match = match;
	return a;
};

/*
A container object for defining the functionality of different node types. For each node type, the following functions must be provided:
(1) build (context = Pattern object) which returns a node sub-tree based on subsequent tokens.
(2) constructor (context = new Node object) which creates an actual node instance with properties calculated in the build function.
(3) match (context = Node object) which returns the matched substring, making updates to the state as necessary.
*/
var NodeTypes = {

	// "Anchor" nodes (typically) don't consume characters, but match based on position, or properties of surrounding characters.
	// While back-references qualify for a separate node type, they have been merged with this as the similar code would be required.
	"Anchor" : {

		"build" : function(){
			var next = this.token_next(), c = next.value.toLowerCase(), negative = false;
			if(c!==next.value) negative = true;
			return new Node.Anchor(c,negative);
		},

		"constructor" : function(type,negative){
			this.type = type;
			this.negative = !!negative;
		},

		"match" : function(state){
			var result = null;
			if(log) console.log("<anchor>",this.type);
			switch(this.type){
				case "^":
					if(state.index===0) result = "";
					else if(!state.start && state.multiline && state.str_peek()==="\n"){ state.str_next(); state.start = true; result = ""; }
					break;
				case "$":
					if(state.index+1===state.string.length) result = "";
					if(state.multiline && state.str_peek()==="\n"){ state.str_next(); state.end = true; result = ""; }
					break;
				case "b":
					var prev = state.string[state.index-1], next = state.string[state.index];
					return ((prev||next) && (!prev||!next||check.w(prev)^check.w(next))^this.negative) ? "" : null;
					break;
				default: // back-references
					if(state.save[this.type]!==null){
						state.local.push({});
						// Create a new pattern based on the saved value and match it within the current state
						result = new Node.And(
							state.save[this.type].split("").map(function(c){ return new Node.Char(c); })
						).match(state);
						state.local.pop();
						if(result===null) state.error_redirect();
					}
			}
			if(log) console.log("</anchor>",this.type);
			if(result!==null) return result;
			else { state.mismatch(); return null; }
		}

	},

	// A "Char" node matches a single character.
	"Char" : {

		"build" : function(){
			return new Node.Char(this.token_next().value);
		},

		"constructor" : function(char){
			this.char = char;
		},

		"match" : function(state){
			var c = state.str_peek();
			if(log) console.log("<char/>",this.char,c);
			if(!state.end && (this.char===c || state.ignoreCase && this.char.toLowerCase()===c.toLowerCase())){
				state.start = true;
				return state.str_next();
			} else { state.mismatch(); return null; }
		}

	},

	// A "CharRange" node is equivalent to an "Or" node with lots of "Char" nodes as children.
	// It exists as a separate node type for the purpose of efficiency.
	"CharRange" : {

		"build" : function(){
			var next = this.token_next(), c = next.value.toLowerCase(), negative = false;
			if(c!==next.value) negative = true;
			switch(c){
				case "d": case "w": case "s":
					return new Node.CharRange(c, negative);
				default: return new Node.Char(next.value);
			}
		},

		"constructor": function(type,negative){
			this.type = type;
			this.negative = !!negative;
		},

		"match": function(state){
			var c = state.str_peek();
			if(log) console.log("<charrange/>", this.type, c);
			if( !state.end && c && (check[this.type](c)^this.negative) ){ state.start=true; return state.str_next(); }
			else { state.mismatch(); return null; }
		}

	},

	// An "And" node requires each of this children (contained in the series array) to be sequentially matched.
	"And" : {
		"build" : function(){
			var series = [], choice = [], next, toplevel = (this.index===0);
			var save = true, lookahead = false, negative = false;
			if(!toplevel){
				this.buffer.shift(); // skip "("
				if( (next=this.token_peek(1)) && next.match("?",1) ){
					if( (next=this.token_peek(2)) && next.match(":",0,0) ){ save = false; }
					else if( (next=this.token_peek(2)) && next.match("=",0,0) ){ save = false; lookahead = true; }
					else if( (next=this.token_peek(2)) && next.match("!",0,0) ){ save = false; lookahead = true; negative = true; }
					if(!save) this.buffer.splice(0,2);
				}
			}
			while(true){
				next = this.token_peek();

				if(next===null){
					if(toplevel) break;
					else throw new Error("Unexpected End of Pattern");
				} else if(next.match("^",1) || next.match("$",1)){
					series.add(this.Anchor());
				} else if(next.match(")",1)){
					this.buffer.shift(); // skip ")"
					break;
				} else if(next.match("(",1)){
					series.add(this.And());
				} else if(next.match("[",1)){
					series.add(this.Or());
				} else if(next.match("|",1)){
					this.token_next();
					choice.push(series);
					series = [];
				} else if(next.match("{",1)||next.match("?",1)||next.match("*",1)||next.match("+",1)){
					if(series.length && !(series.last() instanceof Node.Loop)) series.add(this.Loop(series.pop()));
					else throw new Error("Nothing to Repeat");
				} else if(next.match(".",1)){
					this.token_next();
					series.push(new Node.CharRange("."));
				} else if(next.operator){
					throw new Error("Operator Functionality Not Implemented");
				} else if(next.escape){
					if(check.d(next.value) && next.value!=="0" || next.value.toLowerCase()==="b") series.add(this.Anchor());
					else if(next.value==="0") series.add(new Node.Char(0));
					else if(next.value in whitespace) series.add(new Node.Char(whitespace[next.value]));
					else if(next.value==="x") series.add(new Node.Char( String.fromCharCode(this.hex_read(2)) ));
					else if(next.value==="u") series.add(new Node.Char( String.fromCharCode(this.hex_read(4)) ));
					else if(next.value==="c"){
						this.token_next(); next = this.token_next();
						if(next===null) throw new Error("Unexpected End of Pattern");
						var cc = next.value.toUpperCase().charCodeAt();
						if(65<=cc && cc<=90) series.add(new Node.Char( String.fromCharCode(cc-64) ));
						else throw new Error("Unexpected Character");
					} else series.add(this.CharRange());
				} else series.add(this.Char());
			}
			if(choice.length) series = [new Node.Or(choice.add(series).map(function(s){ return new Node.And(s,0); }))];
			return new Node.And(series, save && !toplevel ? ++this.group : 0, lookahead, negative);
		},

		"constructor" : function(series,save,lookahead,negative){
			this.series = series;
			this.save = save;
			this.lookahead = !!lookahead;
			this.negative = !!negative;
		},

		"match": function(state){
			var temp, local = state.local.add(state.error_redirect({"dev":0,"str":"","si":state.index})).last();
			while(local.dev<this.series.length){
				if(log) console.log("<and>",local.json());
				temp = this.series[local.dev].match(state);
				if(temp!==null){
					local.str+=temp;
					local.dev++;
				} else {
					local = state.error_redirect();
					if(!local)
						if(this.negative) break;
						else return null;
					else state.local.last(local);
				}
			}
			if(this.negative && local!==null){ // this.lookahead assumed true
				while(state.mismatch()){
					state.error_ignore();
					state.alternative.pop();
				}
				state.local.pop();
				return null;
			} else local = state.local.pop();
			if(this.save) state.save[this.save] = local.str;
			if(log) console.log("</and>",local.json());
			if(this.lookahead){ state.index = local.si; return ""; }
			else return local.str;
		}

	},

	// An "Or" node requires any one of its children (contained in the options array) to be matched (assuming it is not negative).
	"Or" : {

		"build" : function(){
			var next = this.token_next(), options = [], negative = false;
			while(true){
				next = this.token_next();
				if(next===null) throw new Error("Unexpected End of Pattern");
				else if(next.match("^",1) && options.length===0) negative = true;
				else if(next.match("]",1)) break;
				else if(next.match("-",1)
					&& options.last() instanceof Node.Char
					&& !this.token_peek().match("]",1)
					&& this.token_peek()!==null
					&& !range ){
					next = this.token_next();
					options.push(new Node.CharRange([options.pop().char+next.value]));
				} else if(next.escape){
					this.buffer.unshift(next);
					options.push(this.CharRange());
				} else options.push(new Node.Char(next.value));
			}
			return new Node.Or(options,negative);
		},

		"constructor" : function(options,negative){
			this.options = options;
			this.negative = !!negative;
		},

		"match" : function(state){
			var i, local = state.local.add(state.error_redirect({"dev":0,"str":""})).last();
			while(local.dev<this.options.length){
				if(log) console.log("<or>",local.json());
				i = local.dev++; // Make alternative
				if(local.dev<this.options.length) state.remember(); // Save Alternate
				local.str = this.options[i].match(state); // Explore Consequence
				if(local.str!==null){
					if(log) console.log("</or>",local.json());
					return state.local.pop().str; // Return Success + No Backtracking
				}
				local = state.error_redirect(local); // Check for Backtracking
				if(!local) return null;
				else state.local.last(local);
			}
		}

	},

	// The "Loop" node requires its only child to be matched as many number of times as specified.
	"Loop" : {

		"build" : function(node){
			var next = this.token_next(), min = 0, max = Infinity, greedy = true;
			if(next.match("{")){
				var stage = 0;
				while(true){
					next = this.token_next();
					if(next===null) throw new Error("Unexpected End of Pattern");
					var cc = next.value.charCodeAt(0);
					if(47<cc && cc<58)
						if(stage===0) min = min*10+cc-48;
						else max = (max===Infinity ? cc-48 : max*10+cc-48);
					else if(next.value==="," && stage<1) ++stage;
					else if(next.value==="}") break;
					else throw new Error("Unexpected Character");
				}
				if(stage===0) max = min; 
			} else {
				if(next.match("?")) max = 1;
				else if(next.match("+")) min = 1;
			}
			next = this.token_peek();
			if(next!==null && next.match("?",1)){
				greedy = false;
				this.token_next();
			}
			return new Node.Loop(node,min,max,greedy);
		},

		"constructor" : function(node,minimum,maximum,greedy){
			this.node = node;
			this.minimum = minimum;
			this.maximum = (maximum===Infinity?-1:maximum);
			this.greedy = greedy; // should the number of matches be maximized?
		},

		"match" : function(state){

			var i, j, k, temp, alternative;
			var local = state.local.add(state.error_redirect({"dev":0,"str":"","match":[]})).last();
			if(log) console.log("<loop>",local.json());

			// on first encounter, first ensure minimum match
			if(local.dev===0){
				while(true){
					for(i=0; i<this.minimum; ++i){
						temp = this.node.match(state);
						if(temp!==null) local.str+=temp;
						else break;
					}
					if(i<this.minimum){
						local = state.error_redirect(local);
						if(!local){ state.local.pop(); return null; }
						else continue;
					}
					break;
				}
			}

			if(this.greedy){
				if(local.dev===0){
					// on first encounter, match as much as possible and save each individual match
					++local.dev;
					state.remember(); // optimistically assume the existence of alternative
					k = state.alternative.length-1; // record alternative index in case there are no alternatives
					for(i=this.minimum; i<this.maximum; ++i){
						temp = this.node.match(state);
						if(temp!==null) local.match.push(temp);
						else break;
					}
					if(i<this.maximum) state.error_ignore();
					if(local.dev>local.match.length) state.alternative.splice(k,1); // no alternatives: forget alternative
					else state.alternative[k].local.last().match = local.match.clone(); // update alternative with info available only now
					temp = local.match.join("");
				} else {
					// on subsequent encounters, use previous saved values
					temp = local.match.slice(0,-local.dev).join("");
					if(++local.dev<=local.match.length) state.remember();
				}
			} else {
				// Check to see if a greater deviation is possible, without actually advancing. If yes, remember alternative.
				k = state.clone();
				temp = this.node.match(state);
				state = k;
				if(temp!==null){
					local.match.push(temp);
					state.remember();
					temp = local.match.slice(0,-1).join("");
				} else {
					state.error_ignore();
					temp = local.match.join("");
				}
			}

			if(log) console.log("</loop>",local.json());
			return state.local.pop().str + temp;

		} // match

	} // Loop

}; // NodeTypes





for(var name in NodeTypes){
	Node[name] = new Node(name, NodeTypes[name].constructor, NodeTypes[name].match); // Create each new Node Type.
	Pattern.prototype[name] = NodeTypes[name].build; // This allows the function context to be the Pattern.
}

return Pattern;

})();





if(typeof(window)==="undefined") module.exports = exports = RegExp2; // node.js