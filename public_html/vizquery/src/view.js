// Constants
import { COMMONS_URL_FLAG, USES_COMMONS } from './conf.js';
import { COMMONS_EXAMPLES, EXAMPLES } from "./queries.js";

// Libraries
import Vue from "vue";

// Components
import displayTable from "./components/display-table.vue";
import displayGrid from "./components/display-grid.vue";
import entityEntry from "./components/entity-entry.vue";
import queryLink from "./components/query-link.vue";
import subjectEntry from "./components/subject-entry.vue";
import { Modal } from "uiv";

// Custom code
import { $ } from "./util.js";
import Query from "./query.js";
import parseCsv from "./csv.js";
import { query as fetchQuery } from "./api.js";

export default function(selector) {
    return new Vue({
        el : selector,

        components : {
            'entity-entry' : entityEntry,
            'display-table' : displayTable,
            'display-grid' : displayGrid,
            'query-link' : queryLink,
            'subject-entry' : subjectEntry,
            Modal
        },

        data : {
            COMMONS_URL_FLAG,
            display : 'grid',
            error : false,
            examples : USES_COMMONS ? COMMONS_EXAMPLES : EXAMPLES,
            hadResults : false,
            loading : false,
            modal : {
                show : false,
                title : null
            },
            query : new Query(),
            queryString : null,
            results : [],
            show : {
                exampleQueries : false,
                extendedIntro : false
            },
            state : 'search',
            usesCommons : USES_COMMONS
        },

        mounted() {
            if (!!window.location.hash) {
                this.parseHash();
            }

            // Make sure that there's always *one* triple on an empty
            // query builder
            if (this.numberOfTriples === 0) {
                this.query.addEmptyTriple();
            }

            window.addEventListener('hashchange', this.parseHash.bind(this));
        },

        computed : {
            csv() {
                return parseCsv(this.results);
            },

            numberOfTriples() {
                return this.query.triples.length;
            }
        },

        methods : {
            addRule() {
                this.query.addEmptyTriple();
            },

            doQuery() {
                const query = this.query.stringify();
                window.location.hash = encodeURIComponent(query);
            },

            async parseHash() {
                window.scrollTo(0, 0);

                const query = decodeURIComponent(window.location.hash.slice(1));

                this.results = [];
                this.query = new Query();
                this.loading = true;
                this.queryString = query;
                this.slowQuery = false;

                // This whole query resetting and then doing a nextTick
                // feels pretty voodoo to me, but it is necessary...
                await Vue.nextTick();

                this.query = new Query(query);

                const results = await fetchQuery(this.query.stringify());

                if (!results) {
                    this.error = 'Something went wrong...';
                    this.loading = false;
                    return;
                }

                this.results = results;
                this.loading = false;
                this.hadResults = true;
            },

            showRemoveRulesModal() {
                this.modal.title = "Remove all rules";
                this.modal.show = true;
                this.modal.text = "Are you sure you want to remove all rules?";
            },

            setDisplay(type) {
                this.display = type;
            }
        }
    });
};