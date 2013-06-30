
var RegExp2 = require("./regexp");

var tests = {
	"ab{0,4}([bcd]e?)": ["a", "dac", "abbbde"],
	"(a{3})?a{3}": ["aaa"],
	"cat|dog": ["cat", "dog", "cow"],
	// positive lookahead
	"(?=..t)ca": ["cat", "car"],
	// negative lookahead
	"(?!cat)..r": ["cat", "car"],
	"ca(?!t)": ["cat", "car"],
	// word boundary
	"cat\\b": ["cat", "cat dog", "catdog"],
	"\\bdog": ["dog", "cat dog", "catdog"],
	"\\b": ["", "cat"],
	"a\\B": ["aa", "a a"],
	// backreferences
	"\\x61a(..)\\u0061a\\1": ["aabbaabb", "aaccaacc", "aabbaacc"],
};

String.prototype.repeat = function(n){ return new Array(n+1).join(this); };

console.log("\nRegular Expression Engine : Unit Tests\n");
console.log("Regular Expression       Test String              Result    Return Value");
console.log("-".repeat(75));

function test(pattern,string){
	var r1 = JSON.stringify(new RegExp(pattern).exec(string)),
		r2 = JSON.stringify(new RegExp2(pattern).exec(string)),
		test = JSON.stringify(r1)===JSON.stringify(r2),
		out = "";
	out+=pattern+" ".repeat(25-pattern.length);
	out+=string+" ".repeat(25-string.length);
	if(test) out+="Passed"+" ".repeat(4)+r1;
	else {
		out += "Failed\n" +
			"\n\tPattern  : " + pattern +
			"\n\tString   : " + string +
			"\n\tExpected : " + r1 +
			"\n\tActual   : " + r2 +
			"\n\nTest Failed.\n";
	}
	console.log(out);
	return test;
}

for(var pattern in tests){
	if(!tests.hasOwnProperty(pattern)) continue;
	for(var i=0; i<tests[pattern].length; ++i){
		var string = tests[pattern][i];
		if(!test(pattern,string)) process.exit(1);
	}
}

console.log("\nAll Tests Completed Successfully.\n");