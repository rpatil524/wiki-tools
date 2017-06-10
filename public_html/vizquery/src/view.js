import { $, clone } from "./util";
import { DEFAULT_RESULT_LIMIT } from "./conf";
import EXAMPLES from "./examples";
import Query from "./query";
import typeahead from "./typeahead";
import displayTable from "./display-table";
import displayGrid from "./display-grid";
import Vue from "vue";
import Papaparse from "papaparse";

function parseWhere(str) {
    var parts = str.split(" ");

    return {
        has : 'where',
        property : {
            'id' : parts[0]
        },
        value : {
            'id' : parts[1]
        }
    };
}

function createEmptyRule() {
    return {
        has : 'where',
        property : {},
        propertyLabel : null,
        value : {},
        valueLabel : null
    };
}

class View {
    constructor(selector) {
        this.selector = $(selector);
        this.query = new Query();
        this.setup();
    }

    parseResult(result) {
        if (result.image) {
            result.thumb = result.image.value + '?width=300';
        }

        if (result.item) {
            result.id = result.item.value.replace('http://www.wikidata.org/entity/', '');
        }

        return result;
    }

    setup() {
        var self = this;

        this.view = new Vue({
            el : this.selector,

            components : {
                typeahead : typeahead,
                'display-table' : displayTable,
                'display-grid' : displayGrid
            },

            data : {
                state : 'search',

                results : [],

                hadResults : false,

                hasOptions : [
                    { value : 'where', label : 'have' },
                    { value : 'minus', label : "don't have" }
                ],

                query : null,

                display : 'table',

                rules : [ createEmptyRule() ],

                error : false,

                withimages : true,

                limit : DEFAULT_RESULT_LIMIT,

                loading : false,

                examples : EXAMPLES.map(function(e) {
                    e.data = e.data.map(parseWhere);
                    return e;
                })
            },

            computed : {
                csv : function() {
                    var results = clone(this.results).map((d) => {
                        // REALLY UGLY CODE
                        ['item', 'itemDescription', 'itemLabel'].forEach((key) => {
                            d[key] = d[key] && d[key].value ? d[key].value : null;
                        });

                        return d;
                    });

                    var csv = Papaparse.unparse(results, {
                        quotes : true
                    });

                    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
                }
            },

            methods : {
                addRule : function() {
                    this.rules.push(createEmptyRule());
                },

                doQuery : function() {
                    this.results = [];

                    this.loading = true;

                    var rules = clone(this.rules);

                    if (this.withimages) {
                        rules.push({
                            has : 'image'
                        });
                    }

                    this.display = this.withimages ? 'grid' : 'table';

                    rules.limit = this.limit;

                    this.query = self.query.build(rules);

                    self.query.fetch(this.query, function(results) {
                        this.results = results.map(self.parseResult);
                        this.loading = false;
                        this.hadResults = true;
                    }.bind(this));
                },

                removeRule : function(rule) {
                    this.rules = this.rules.filter(function(r) {
                        return r !== rule;
                    });
                },

                setDisplay : function(type) {
                    this.display = type;
                },

                setExample : function(example) {
                    this.rules = clone(example.data);
                }
            }
        });
    }
};

export default View;