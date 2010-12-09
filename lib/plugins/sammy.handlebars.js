(function($) {
    // https://github.com/wycats/handlebars.js/raw/master/lib/handlebars.js (12/9/2010)
    // -- begin handlebars.js --
    var Handlebars = {
        compilerCache: {},

        compile: function(string) {
            if (Handlebars.compilerCache[string] == null) {
                var fnBody = Handlebars.compileFunctionBody(string);
                var fn = new Function("context", "fallback", "stack", "Handlebars", fnBody);
                Handlebars.compilerCache[string] =
                        function(context, fallback, stack) { return fn(context, fallback, stack, Handlebars); };
            }

            return Handlebars.compilerCache[string];
        },

        compileToString: function(string) {
            var fnBody = Handlebars.compileFunctionBody(string);
            return "function(context, fallback, stack) { " + fnBody + "}";
        },

        compileFunctionBody: function(string) {
                var compiler = new Handlebars.Compiler(string);
                compiler.compile();

                return "var stack = stack || [];" + compiler.fn;
        },

        isFunction: function(fn) {
            return Object.prototype.toString.call(fn) == "[object Function]";
        },

        trim: function(str) {
            return str.replace(/^\s+|\s+$/g, '');
        },

        escapeText: function(string) {
            string = string.replace(/'/g, "\\'");
            string = string.replace(/\"/g, "\\\"");
            return string;
        },

        escapeExpression: function(string) {
            // don't escape SafeStrings, since they're already safe
            if (string instanceof Handlebars.SafeString) {
                return string.toString();
            }
            else if (string === null) {
                string = "";
            }

            return string.toString().replace(/&(?!\w+;)|["\\<>]/g, function(str) {
                switch(str) {
                    case "&":
                        return "&amp;";
                        break;
                    case '"':
                        return "\"";
                    case "\\":
                        return "\\\\";
                        break;
                    case "<":
                        return "&lt;";
                        break;
                    case ">":
                        return "&gt;";
                        break;
                    default:
                        return str;
                }
            });
        },

        compilePartial: function(partial) {
            if (Handlebars.isFunction(partial)) {
                compiled = partial;
            } else {
                compiled = Handlebars.compile(partial);
            }

            return compiled;
        },

        buildContext: function(context, stack) {
            var ContextWrapper = function(stack) {
                this.__context__ = context;
                this.__stack__ = stack.slice(0);
                this.__get__ = function(path) {
                    return this.__context__.evalExpression(path, this.__stack__).data;
                };
            };

            ContextWrapper.prototype = context.data;
            return new ContextWrapper(stack);
        },

        // spot to memoize paths to speed up loops and subsequent parses
        pathPatterns: {},

        // returns a two element array containing the numbers of contexts to back up the stack and
        // the properties to dig into on the current context
        //
        // for example, if the path is "../../alan/name", the result will be [2, ["alan", "name"]].
        parsePath: function(path) {
            if (path == null) {
                return [0, []];
            } else if (Handlebars.pathPatterns["hbs-" + path] != null) {
                return Handlebars.pathPatterns["hbs-" + path];
            }

            var parts = path.split("/");
            var readDepth = false;
            var depth = 0;
            var dig = [];
            for (var i = 0, j = parts.length; i < j; i++) {
                switch(parts[i]) {
                    case "..":
                        if (readDepth) {
                            throw new Handlebars.Exception("Cannot jump out of context after moving into a context.");
                        } else {
                            depth += 1;
                        }
                        break;
                    case ".":
                        // do nothing - using .'s is pretty dumb, but it's also basically free for us to support
                    case "this":
                        // if we do nothing you'll end up sticking in the same context
                        break;
                    default:
                        readDepth = true;
                        dig.push(parts[i]);
                }
            }

            var ret = [depth, dig];
            Handlebars.pathPatterns["hbs" + path] = ret;
            return ret;
        },

        isEmpty: function(value) {
            if (typeof value === "undefined") {
                return true;
            } else if (value === null) {
                return true;
            } else if (value === false) {
                return true;
            } else if(Object.prototype.toString.call(value) === "[object Array]" && value.length == 0) {
                return true;
            } else {
                return false;
            }
        },

        // Escapes output and converts empty values to empty strings
        filterOutput: function(value, escape) {

            if (Handlebars.isEmpty(value)) {
                return "";
            } else if (escape) {
                return Handlebars.escapeExpression(value);
            } else {
                return value;
            }
        },

        handleBlock: function(lookup, context, arg, fn, notFn) {
            var out = "", args;
            originalArgs = arg.length ? arg : [null]

            if (Handlebars.isFunction(lookup.data)) {
                args = originalArgs.concat(fn);
                out = out + lookup.data.apply(context, args);

                if (notFn != null && Handlebars.isFunction(lookup.data.not)) {
                    args = originalArgs.concat(notFn);
                    out = out + lookup.data.not.apply(context, args);
                }
            }
            else {
                if (!Handlebars.isEmpty(lookup.data)) {
                    // TODO: which case is this, and what does it mean for multiple args
                    out = out + Handlebars.helperMissing.call(arg[0], lookup, fn);
                }

                if (notFn != null) {
                    out = out + Handlebars.helperMissing.not.call(arg[0], lookup, notFn);
                }
            }

            return out;
        },

        // lookup: The evaluated mustache, either function or value. A Handlebars.Context
        // context: The wrapped context object
        // args: The evaluated arguments to the mustache
        // isEscaped: Is it escaped?
        handleExpression: function(lookup, context, args, isEscaped) {
            var out = "";

            if (Handlebars.isFunction(lookup.data)) {
                out = out + Handlebars.filterOutput(lookup.data.apply(context, args), isEscaped);
            } else if(!Handlebars.isEmpty(lookup.data)) {
                out = out + Handlebars.filterOutput(lookup.data, isEscaped);
            }

            return out;
        },
        
        // lookup: The evaluated mustache, either function or value. A Handlebars.Context
        // context: The context where this item occurred
        // fn: The compiled body of this inverted section
        handleInvertedSection: function(lookup, context, fn) {
            var out = "";
            if(Handlebars.isFunction(lookup.data) && Handlebars.isEmpty(lookup.data())) {
                out = out + fn(context);
            } else if (Handlebars.isEmpty(lookup.data)) {
                out = out + fn(context);
            }
            return out;
        }
    }

    Handlebars.Context = function(context, fallback, path) {
        if (context instanceof Handlebars.Context) {
            this.data = context.data;
            this.fallback = context.fallback;
            this.path = context.path;
        } else {
            this.data = context;
            this.fallback = fallback || {};
            this.path = path || "";
        }
    };
    Handlebars.Context.prototype = {
        // path: The path to evaluate
        // stack: The stack to work with
        evalExpression: function(path, stack) {
            var newContext = new Handlebars.Context(this);
            
            var parsedPath = Handlebars.parsePath(path);
            var depth = parsedPath[0];
            var parts = parsedPath[1];
            if (depth > stack.length) {
                newContext.data = null;
            } else if (depth > 0) {
                newContext = new Handlebars.Context(stack[stack.length - depth]);
            }

            for (var i = 0, j = parts.length; i < j && typeof newContext.data !== "undefined" && newContext.data !== null ; i++) {
                newContext.data = newContext.data[parts[i]];
            }

            if (parts.length == 1 && typeof newContext.data === "undefined") {
                newContext.data = newContext.fallback[parts[0]];
            }

            return newContext;
        }
    };

    Handlebars.Compiler = function(string) {
        this.string     = string;
        this.pointer    = -1;
        this.mustache = false;
        this.text         = "";
        this.fn             = "context = new Handlebars.Context(context, fallback); var out = ''; var lookup; ";
        this.newlines = "";
        this.comment    = false;
        this.escaped = true;
        this.partial = false;
        this.inverted = false;
        this.endCondition = null;
        this.continueInverted = false;
    };

    Handlebars.Exception = function(message) {
        this.message = message;
    };

    // Build out our basic SafeString type
    Handlebars.SafeString = function(string) {
        this.string = string;
    }
    Handlebars.SafeString.prototype.toString = function() {
        return this.string.toString();
    }

    Handlebars.helperMissing = function(object, fn) {
        var ret = "";

        if(object.data === true) {
            return fn(this);
        } else if(object.data === false) {
            return "";
        } else if(Object.prototype.toString.call(object.data) === "[object Array]") {
            for(var i=0, j=object.data.length; i<j; i++) {
                ret = ret + fn(object.data[i]);
            }
            return ret;
        } else {
            return fn(object.data);
        }
    };
    Handlebars.helperMissing.not = function(context, fn) {
        return fn(context);
    }

    Handlebars.Compiler.prototype = {
        getChar: function(n) {
            var ret = this.peek(n);
            this.pointer = this.pointer + (n || 1);
            return ret;
        },

        peek: function(n) {
            n = n || 1;
            var start = this.pointer + 1;
            return this.string.slice(start, start + n);
        },

        compile: function(endCondition) {
            // if we're at the end condition already then we don't have to do any work!
            if (!endCondition || !endCondition(this)) {
                var chr;
                while(chr = this.getChar()) {
                    if(chr === "{" && this.peek() === "{" && !this.mustache) {
                        this.getChar();
                        this.parseMustache();

                    } else {
                        if(chr === "\n") {
                            this.newlines = this.newlines + "\n";
                            chr = "\\n";
                        } else if (chr === "\r") {
                            this.newlines = this.newlines + "\r";
                            chr = "\\r";
                        } else if (chr === "\\") {
                            chr = "\\\\";
                        }
                        this.text = this.text + chr;
                    }

                    if (endCondition && this.peek(5) == "{{^}}") {
                        this.continueInverted = true;
                        this.getChar(5);
                        break;
                    }
                    else if(endCondition && endCondition(this)) { break };
                }
            }

            this.addText();
            this.fn += "return out;";

            return;
        },

        addText: function() {
            if(this.text) {
                this.fn             = this.fn + "out = out + \"" + Handlebars.escapeText(this.text) + "\"; ";
                this.fn             = this.fn + this.newlines;
                this.newlines = "";
                this.text         = "";
            }
        },

        addExpression: function(mustache, params) {
            if(!params[0]) params = ["null"]
            params = params.join(", ")

            var expr = this.lookupFor(mustache);
            this.fn += "var proxy = Handlebars.buildContext(context, stack);"
            this.fn += "out = out + Handlebars.handleExpression(" + expr + ", proxy, [" + params + "], " + this.escaped + ");";
        },

        addInvertedSection: function(mustache) {
            var compiler = this.compileToEndOfBlock(mustache);
            var result = compiler.fn;

            // each function made internally needs a unique IDs. These are locals, so they
            // don't need to be globally unique, just per compiler
            var fnId = "fn" + this.pointer.toString();
            this.fn += "var " + fnId + " = function(context) {" + result + "}; ";
            this.fn += "lookup = " + this.lookupFor(mustache) + "; ";
            this.fn += "out = out + Handlebars.handleInvertedSection(lookup, context, " + fnId + ");"

            this.openBlock = false;
            this.inverted = false;
        },

        lookupFor: function(param) {
            if (typeof param === "undefined") {
                return "context";
            }
            else {
                return "(context.evalExpression('" + param + "', stack))";
            }
        },

        compileToEndOfBlock: function(mustache) {
            var compiler = new Handlebars.Compiler(this.string.slice(this.pointer + 1));

            // sub-compile with a custom EOF instruction
            compiler.compile(function(compiler) {
                if (compiler.peek(3) === "{{/") {
                    if(compiler.peek(mustache.length + 5) === "{{/" + mustache + "}}") {
                        compiler.getChar(mustache.length + 5);
                        return true;
                    } else {
                        throw new Handlebars.Exception("Mismatched block close: expected " + mustache + ".");
                    }
                }
            });

            // move the pointer forward the amount of characters handled by the sub-compiler
            this.pointer += compiler.pointer + 1;

            return compiler;
        },

        addBlock: function(mustache, params) {
            var compiler = this.compileToEndOfBlock(mustache);
            var result = compiler.fn;

            // each function made internally needs a unique IDs. These are locals, so they
            // don't need to be globally unique, just per compiler
            var fnId = "fn" + this.pointer.toString();
            this.fn += "var wrappedContext = Handlebars.buildContext(context, stack);";
            this.fn += "var " + fnId + " = function(context) {" + result + "}; ";
            this.fn += "lookup = " + this.lookupFor(mustache) + "; ";
            this.fn += "arg = [" + params.join(", ") + "] ;";
            this.fn += "stack.push(context);";

            if (compiler.continueInverted) {
                var invertedCompiler = this.compileToEndOfBlock(mustache);
                this.fn += "    var " + fnId + "Not = function(context) { " + invertedCompiler.fn + " };";
            }
            else {
                this.fn += " var " + fnId + "Not = null;";
            }
            this.fn += "out = out + Handlebars.handleBlock(lookup, wrappedContext, arg, " + fnId + ", " + fnId + "Not);"

            this.fn += "stack.pop();";
            this.openBlock = false;
        },

        addPartial: function(mustache, param) {
            // either used a cached copy of the partial or compile a new one
            this.fn += "if (typeof context.fallback['partials'] === 'undefined' || typeof context.fallback['partials']['" + mustache + "'] === 'undefined') throw new Handlebars.Exception('Attempted to render undefined partial: " + mustache + "');";
            this.fn += "out = out + Handlebars.compilePartial(context.fallback['partials']['" + mustache + "'])(" + param + ", null, stack);";
        },

        parseMustache: function() {
            var chr, part, mustache, param;

            var next = this.peek();

            if(next === "!") {
                this.comment = true;
                this.getChar();
            } else if(next === "#") {
                this.openBlock = true;
                this.getChar();
            } else if (next === ">") {
                this.partial = true;
                this.getChar();
            } else if (next === "^") {
                this.inverted = true;
                this.openBlock = true;
                this.getChar();
            } else if(next === "{" || next === "&") {
                this.escaped = false;
                this.getChar();
            }

            this.addText();
            var params = [""], currentParam = 0, literals = [];

            while(chr = this.getChar()) {
                if(this.stringLiteral) {
                    params[currentParam] += chr;

                    if(chr === "\\" && this.peek() === '"') {
                        params[currentParam] += '"';
                        this.getChar();
                    } else if(chr === '"') {
                        params[++currentParam] = ""
                        this.stringLiteral = false;
                    }
                } else if(chr === '"') {
                    if(params[currentParam] !== "") {
                        throw new Handlebars.Exception("You are already in the middle of" +
                                                                                     "the " + params[currentParam] + " param. " +
                                                                                     "You cannot start a String param")
                    }

                    this.stringLiteral = true;
                    params[currentParam] = chr;
                    literals[currentParam] = true;
                } else if(chr === " ") {
                    if(params[currentParam] !== "") params[++currentParam] = ""
                } else if(chr === "}" && this.peek() === "}") {
                    mustache    = params[0];
                    arguments = [];

                    if(!params[1]) params[1] = undefined;

                    for(var i=1,l=params.length; i<l; i++) {
                        var argument = params[i];
                        arguments.push( literals[i] ? argument : "(" + this.lookupFor(argument) + ".data)");
                    }

                    this.mustache = false;

                    // finish reading off the close of the handlebars
                    this.getChar();
                    // {{{expression}} is techically valid, but if we started with {{{ we'll try to read
                    // }}} off of the close of the handlebars
                    if (!this.escaped && this.peek() === "}") {
                        this.getChar();
                    }

                    if(this.comment) {
                        this.comment = false;
                        return;
                    } else if (this.partial) {
                        this.addPartial(mustache, "(" + this.lookupFor(argument) + ")");
                        this.partial = false;
                        return;
                    } else if (this.inverted) {
                        this.addInvertedSection(mustache);
                        this.inverted = false;
                        return;
                    } else if(this.openBlock) {
                        this.addBlock(mustache, arguments)
                        return;
                    } else {
                        return this.addExpression(mustache, arguments);
                    }

                    this.escaped = true;
                } else if(this.comment) {
                    ;
                } else {
                    params[currentParam] += chr;
                }
            }
        }
    };

    // CommonJS Exports
    var exports = exports || {};
    exports['compile'] = Handlebars.compile;
    exports['compileToString'] = Handlebars.compileToString;

    // -- end handlebars.js --
    
    Sammy = Sammy || {};

    // <tt>Sammy.Handlebars</tt> provides a quick way of using Handlebars templates in your app.
    // The plugin itself includes the handlebars.js library created by Yehuda Katz at
    // at http://github.com/wycats/handlebars.js
    //
    // Handlebars.js is an extension to the Mustache templating language  created by Chris Wanstrath. Handlebars.js
    // and Mustache are both logicless templating languages that keep the view and the code separated like
    // we all know they should be.
    //
    // By default using Sammy.Handlbars in your app adds the <tt>handlebars()</tt> method to the EventContext
    // prototype. However, just like <tt>Sammy.Template</tt> you can change the default name of the method
    // by passing a second argument (e.g. you could use the hbr() as the method alias so that all the template
    // files could be in the form file.hbr instead of file.handlebars)
    //
    // ### Example #1
    //
    // The template (mytemplate.hb):
    //
    //       <h1>\{\{title\}\}<h1>
    //
    //       Hey, {{name}}! Welcome to Handlebars!
    //
    // The app:
    //
    //       var $.app = $.sammy(function() {
    //         // include the plugin and alias handlebars() to hb()
    //         this.use(Sammy.Handlebars, 'hb');
    //
    //         this.get('#/hello/:name', function() {
    //           // set local vars
    //           this.title = 'Hello!'
    //           this.name = this.params.name;
    //           // render the template and pass it through handlebars
    //           this.partial('mytemplate.hb');
    //         });
    //
    //       });
    //
    // If I go to #/hello/AQ in the browser, Sammy will render this to the <tt>body</tt>:
    //
    //       <h1>Hello!</h1>
    //
    //       Hey, AQ! Welcome to Handlebars!
    //
    //
    // ### Example #2 - Handlebars partials
    //
    // The template (mytemplate.hb)
    //
    //       Hey, {{name}}! {{>hello_friend}}
    //
    //
    // The partial (mypartial.hb)
    //
    //       Say hello to your friend {{friend}}!
    //
    // The app:
    //
    //       var $.app = $.sammy(function() {
    //         // include the plugin and alias handlebars() to hb()
    //         this.use(Sammy.Handlebars, 'hb');
    //
    //         this.get('#/hello/:name/to/:friend', function() {
    //           var context = this;
    //
    //           // fetch handlebars-partial first
    //           $.get('mypartial.hb', function(response){
    //             context.partials = response;
    //
    //             // set local vars
    //             context.name = this.params.name;
    //             context.hello_friend = {name: this.params.friend};
    //
    //             // render the template and pass it through handlebars
    //             context.partial('mytemplate.hb');
    //           });
    //         });
    //
    //       });
    //
    // If I go to #/hello/AQ/to/dP in the browser, Sammy will render this to the <tt>body</tt>:
    //
    //       Hey, AQ! Say hello to your friend dP!
    //
    // Note: You dont have to include the handlebars.js file on top of the plugin as the plugin
    // includes the full source.
    //
    
    var handlebars_cache = {};
    // *Helper* Uses handlebars.js to parse a template and interpolate and work with the passed data
    //
    // ### Arguments
    //
    // * `template` A String template.
    // * `data` An Object containing the replacement values for the template.
    //   data is extended with the <tt>EventContext</tt> allowing you to call its methods within the template.
    //
    Sammy.handlebars = function(template, data, partials, name) {
        // use name for caching
        if (typeof name == 'undefined') name = template;
        var fn = handlebars_cache[name];
        if (!fn) {
            fn = handlebars_cache[name] = Handlebars.compile(template);
        }
        data     = $.extend({}, this, data);
        partials = $.extend({}, data.partials, partials);
        return fn(data, {"partials":partials});
    };

    Sammy.SafeString = Handlebars.SafeString
    
    Sammy.Handlebars = function(app, method_alias) {
        // set the default method name/extension
        if (!method_alias) method_alias = 'handlebars';
        app.helper(method_alias, Sammy.handlebars);

    };

})(jQuery);
