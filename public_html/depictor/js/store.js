import { randInt, sample, timeout } from 'donot';
import Vue from 'vue'
import Vuex from 'vuex'
import Api from './api.js';
import {
    DEFAULT_LOCALE, THUMB_SIZE, MAX_API_TRIES, MAX_API_CHECK_TRIES
} from './const.js';
import { getLocale } from './util.js';

Vue.use(Vuex);

export default function createStore(opts) {
    const locale = getLocale( DEFAULT_LOCALE );
    const api = new Api(locale);

    function getInitialState() {
        return {
            api : api,
            authUrl: opts.authUrl,
            birthYear : null,
            candidate : null,
            candidates : [],
            category : null,
            defaultLocale : DEFAULT_LOCALE,
            errorMessage : null,
            initLocale : getLocale( DEFAULT_LOCALE ),
            isAccessTokenRequest: opts.isAccessTokenRequest,
            isDebug: opts.isDebug,
            isInvalidAccessTokenRequest : opts.isInvalidAccessTokenRequest,
            isLoggedIn: opts.isLoggedIn,
            isLoggedOut: opts.isLoggedOut,
            item : null,
            items : [],
            loading : false,
            locale : getLocale( DEFAULT_LOCALE ),
            locales : opts.locales,
            rootUrl: opts.rootUrl,
            screen : 'intro',
            userName: opts.userName
        };
    }

    return new Vuex.Store({
        state : getInitialState(),

        getters : {
            hasRemainingCandidates(state, getters) {
                return getters.remainingCandidates.length > 0;
            },

            hasRemainingItems(state, getters) {
                return getters.remainingItems.length > 0;
            },

            remainingCandidates(state) {
                return state.candidates.filter(c => !c.done);
            },

            remainingItems(state) {
                return state.items.filter(item => !item.done);
            },

            screenState(state) {
                if (state.errorMessage) {
                    return 'error';
                } else if (state.loading) {
                    return 'loading';
                } else if (!state.isLoggedIn) {
                    // None of the regular screens are shown when not logged in
                    return 'logged-out';
                } else {
                    return state.screen;
                }
            }
        },

        mutations : {
            candidate(state, candidate) {
                state.candidate = candidate;
            },

            candidateDone(state, mid) {
                state.candidates = state.candidates.map((candidate) => {
                    if (candidate.mid === mid) {
                        candidate.done = true;
                    }

                    return candidate;
                });
            },

            candidates(state, candidates) {
                state.candidates = candidates.map((candidate) => {
                    // Add resized thumbnail here
                    candidate.done = false;
                    return candidate;
                });
            },

            category(state, category) {
                state.category = category;
            },

            doneLoading(state) {
                state.loading = false;
            },

            errorMessage(state, message) {
                state.errorMessage = message;
            },

            hash(state, opts) {
                // Transform opts to a URL and set the hash, after that
                // a hashchange will trigger start
                const queryType = window.encodeURIComponent(opts.type);

                // For some reason, using newlines in GET requests give a HTTP 400
                // on Toolforge, so let's replace newlines with spaces in values,
                // especially needed on SPARQL queries
                let value = opts[opts.type];

                if (typeof value === 'string') {
                    value = value.trim().replace(/\n/g, ' ').replace(/ +/g, ' ');
                }

                let queryValue = window.encodeURIComponent(value);

                // If we have 'deep' categories we also need to add the depth level
                if (queryType === 'category' && opts.catdeep) {
                    queryValue = `${queryValue}|${opts.catdepth}`;
                }

                const search = `queryType=${queryType}&queryValue=${queryValue}`;
                window.location.search = search;
            },

            isLoading(state) {
                state.loading = true;
            },

            item(state, item) {
                state.item = item;
            },

            itemDone(state, qid) {
                state.items = state.items.map((item) => {
                    if (item.qid === qid) {
                        item.done = true;
                    }

                    return item;
                });
            },

            items(state, items) {
                if (!items.length) {
                    throw new Error("No items given");
                }

                state.items = items.map((item) => {
                    item.thumb = `${item.image}?width=${THUMB_SIZE}`;
                    item.done = false;
                    return item;
                });
            },

            locale(state, locale) {
                const url = new window.URL(window.location);
                url.searchParams.set("locale", locale);
                window.location.search = url.searchParams.toString();
            },

            processCandidate(state) {
                state.candidates = state.candidates.map((candidate) => {
                    if (candidate.mid === state.candidate.mid) {
                        candidate.done = true;
                    }

                    return candidate;
                });
            },

            screen(state, screen) {
                state.screen = screen;
            }
        },

        actions : {
            async handleCandidate({ commit, dispatch, state }, status) {
                await api.addFile({
                    mid : state.candidate.mid,
                    qid : state.item.qid,
                    category : state.category,
                    user : state.userName,
                    status : status
                });

                commit('processCandidate');

                await dispatch('nextCandidate');
            },

            async itemDone({ state, commit }, qid) {
                await api.itemDone({
                    user : state.userName,
                    qid
                });

                commit('itemDone', qid);
            },

            async nextCandidate({ state, commit, getters, dispatch }) {
                // First check if there are remaining candidates, and if so,
                // pick one of those, otherwise pick a new item
                if (getters.hasRemainingCandidates) {
                    console.log("Getting a new candidate");
                    const candidate = sample(getters.remainingCandidates);

                    // Check if the candidate has been processed earlier
                    const exists = await api.fileExists(candidate.mid);
                    console.log(`${candidate.mid} exists: ${exists}`);

                    if (exists) {
                        commit('candidateDone', candidate.mid);
                        console.log('Candidate exists in database, skipping');
                        dispatch('nextCandidate');
                    } else {
                        // Candidate does not exist, put it up
                        commit('candidate', candidate);
                    }
                } else {
                    console.log('No more candidates, getting new item');

                    // Set item to done
                    await dispatch('itemDone', state.item.id);
                    await dispatch("nextItem");
                }
            },

            async nextItem({ commit, getters, dispatch }) {
                if (!getters.hasRemainingItems) {
                    console.log('No more remaining items');
                    commit('errorMessage', 'Seems there are no more items to process. Try again with a different query.');
                    return;
                }

                const nextItem = sample(getters.remainingItems);

                // Check if this item is 'done', and if so go on
                const exists = await api.itemExists(nextItem.qid);
                console.log(`${nextItem.qid} exists: ${exists}`);

                if (exists) {
                    console.log('Item is done');
                    await dispatch('itemDone', nextItem.qid);
                    dispatch('nextItem');
                    return;
                }

                // Get more item info
                let item;

                try {
                    item = await api.getCandidateItem(nextItem.qid);
                } catch (e) {
                    console.log(e);
                    return;
                }

                if (!api.isValidItem(item)) {
                    console.log(`Item ${item.qid} is invalid, skipping`);
                    await dispatch("itemDone", nextItem.qid);
                    dispatch("nextItem");
                    return;
                }

                // Get candidates
                let candidates;
                try {
                    candidates = await api.getCandidates(
                        nextItem.qid, nextItem.category
                    );
                } catch (e) {
                    console.log(`Could not get candidates for ${nextItem.qid}`);
                    await dispatch('itemDone', nextItem.qid);
                    dispatch('nextItem');
                    return;
                }


                commit('item', item);
                commit('candidates', candidates);
                commit('category', nextItem.category);

                // All went well, let's get out of the loop
                console.log('Got candidates and item');
                await dispatch("nextCandidate");
            },

            async query({ commit, dispatch }, query) {
                const { type, value } = query;
                commit('isLoading');

                let items = null;

                if (type === 'year') {
                    items = await api.getPeopleByBirthyear(value);
                } else if (type === 'category') {
                    // Check if this is a deep search (indicated by a pipe|)
                    if (value.includes('|')) {
                        const [category, depth] = value.split('|');
                        items = await api.getItemsByCommonsCategory(value, parseInt(depth));
                    } else {
                        items = await api.getItemByCommonsCategory(value);
                    }
                } else if (type == 'qid') {
                    // This is mainly used for debugging and testing purposes,
                    // hence it's not available in the main interface
                    items = await api.getItemByQid(value);
                } else if (type === 'sparql') {
                    items = await api.getItemsWithSparql(value);
                } else {
                    console.log('No valid query options');
                    return;
                }

                if (!items.length) {
                    commit('errorMessage', 'No items for this query. Try another query.');
                    return;
                }

                commit('items', items);
                await dispatch("nextItem");
                commit('screen', 'game');
                commit('doneLoading');
            },

            reset() {
                // TODO: this is a bit rude, but oh well
                window.location.search = '';
            }
        }
    });
}