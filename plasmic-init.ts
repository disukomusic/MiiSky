import { initPlasmicLoader } from "@plasmicapp/loader-nextjs";
import { SevenSegmentClock } from "./components/SevenSegmentClock";
import { BlueskyRichText } from "./components/BlueskyRichText";
import { BlueskyAuthProvider } from "./lib/BlueskyAuthProvider";
import { BlueskyFeedProvider } from "./components/BlueskyFeedProvider";
import { BlueskyVideo } from "./components/BlueskyVideo";
import { ContentEditableTextarea } from "./components/ContentEditableTextarea";
import { AutoScrollDiv } from "./components/AutoScrollDiv";
import { DrawingCanvas } from "./components/DrawingCanvas";

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: "uXdrFBmdkh3rYkWg8wvzGE",
      token: "AV5WsZSY50EYqQIo57hskIPRq9y2F6oPPsRu774TbmJQb6neXl8Xksd6SK1PZ285C2UIYebzSotmATYwXVA",
    },
  ],
  
  preview: false,
});

PLASMIC.registerComponent(SevenSegmentClock, {
  name: "SevenSegmentClock",
  props: {
    className: "string",

    clockFontFamily: {
      type: "string",
      defaultValue: "monospace",
      description: "Font family for the main clock digits (hours and minutes)",
    },

    ampmFontFamily: {
      type: "string",
      defaultValue: "sans-serif",
      description: "Font family for the AM / PM indicator",
    },
  },
});

PLASMIC.registerComponent(BlueskyRichText, {
  name: 'BlueskyRichText',
  props: {
    record: {
      type: 'object',
      defaultValue: { text: "Hello #world https://bsky.app" }
    },
    onTagClick: {
      type: 'eventHandler',
      argTypes: [{ name: 'tag', type: 'string' }]
    },
    fontSize: {
      type: 'number',
    },
  },
});

PLASMIC.registerComponent(BlueskyFeedProvider, {
  name: 'BlueskyFeedProvider',
  props: {
    // 1. Mode Selection
    mode: {
      type: 'choice',
      options: [
        { label: 'User Profile', value: 'author' },
        { label: 'Specific Feed (URL)', value: 'feed' },
        { label: 'Search Query', value: 'search' },
        { label: 'My Timeline (Following)', value: 'timeline' },
        { label: 'Thread View', value: 'thread' },
      ],
      defaultValue: 'author'
    },

    actor: {
      type: 'string',
      defaultValue: 'bsky.app',
      description: 'Handle (required for User Profile mode)',
      hidden: (props) => props.mode !== 'author'
    },
    feedUrl: {
      type: 'string',
      description: 'Full URL or at:// URI. Leave empty for Discover.',
      hidden: (props) => props.mode !== 'feed'
    },
    searchQuery: {
      type: 'string',
      defaultValue: 'Plasmic',
      description: 'Search terms',
      hidden: (props) => props.mode !== 'search'
    },

    limit: { type: 'number', defaultValue: 20 },


    threadUri: {
      type: 'string',
      description: 'AT-URI of the root post (e.g., at://did:.../app.bsky.feed.post/<rkey>)',
      hidden: (props) => props.mode !== 'thread'
    },
    threadDepth: {
      type: 'number',
      defaultValue: 6,
      description: 'Reply depth. Higher values fetch deeper child replies.',
      hidden: (props) => props.mode !== 'thread'
    },
    threadParentHeight: {
      type: 'number',
      defaultValue: 80,
      description: 'Ancestor height. Higher values fetch more parents/grandparents.',
      hidden: (props) => props.mode !== 'thread'
    },
    focusedUri: {
      type: 'string',
      description: 'Optional: AT-URI of a reply to highlight/focus within the thread',
      hidden: (props) => props.mode !== 'thread'
    },

    // Auth props
    identifier: { type: 'string', description: 'For Login' },
    appPassword: { type: 'string', description: 'For Login' },

    children: 'slot',
  },
  providesData: true,
  refActions: {
    // --- Auth Actions ---

    login: {
      description: 'Login',
      argTypes: [
        { name: 'identifier', type: 'string', displayName: 'Handle (e.g., suko.pet)' },
        { name: 'appPassword', type: 'string', displayName: 'App Password (dev/Studio)', defaultValue: '' }
      ]
    },

    logout: {
      description: 'Logout',
      argTypes: []
    },

    // --- Post Interactions ---
    likePost: {
      description: 'Like a post',
      argTypes: [
        { name: 'uri', type: 'string' },
        { name: 'cid', type: 'string' }
      ]
    },
    repostPost: {
      description: 'Repost a post',
      argTypes: [
        { name: 'uri', type: 'string' },
        { name: 'cid', type: 'string' }
      ]
    },
    fetchPostLikes: {
      description: 'Fetch and attach likers to a specific post object',
      argTypes: [
        { name: 'uri', type: 'string', displayName: 'Post URI' },
        { name: 'limit', type: 'number', defaultValue: 5, displayName: 'Number of Likers' }
      ]
    },

    // --- Actor Fetchers ---
    fetchActorFollowers: {
      description: 'Fetch followers for an actor',
      argTypes: [{ name: 'actor', type: 'string', displayName: 'Actor Handle (optional)' }]
    },
    fetchActorFollowing: {
      description: 'Fetch following for an actor',
      argTypes: [{ name: 'actor', type: 'string', displayName: 'Actor Handle (optional)' }]
    },
    fetchActorLists: {
      description: 'Fetch lists for an actor',
      argTypes: [{ name: 'actor', type: 'string', displayName: 'Actor Handle (optional)' }]
    },

    // --- Post Creation & Thread Fetching ---
    createPost: {
      description: "Create a new post (text, images, reply, or quote)",
      argTypes: [
        { name: "text", type: "string", displayName: "Text Content" },

        // Images arry
        {
          name: "images",
          type: "object",
          displayName: "Images",
          description: "Array of { file: File, alt?: string }"
        },

        // Quote embed
        { name: "quoteUri", type: "string", displayName: "Quote URI" },
        { name: "quoteCid", type: "string", displayName: "Quote CID" },

        // Reply threading
        { name: "replyParentUri", type: "string", displayName: "Reply Parent URI" },
        { name: "replyParentCid", type: "string", displayName: "Reply Parent CID" },
        { name: "replyRootUri", type: "string", displayName: "Reply Root URI" },
        { name: "replyRootCid", type: "string", displayName: "Reply Root CID" },
      ]
    },
    fetchPostThread: {
      description: 'Fetch a thread (root + ancestors + replies)',
      argTypes: [
        { name: 'uri', type: 'string', displayName: 'Root Post AT-URI' },
        {
          name: 'depth',
          type: 'number',
          defaultValue: 6,
          description: 'Reply depth (descendants)'
        },
        {
          name: 'parentHeight',
          type: 'number',
          defaultValue: 80,
          description: 'Ancestor height (parents/grandparents)'
        }
      ]
    },
    clearThread: {
      description: 'Clear current thread state',
      argTypes: []
    },
    loadMore: {
      description: 'Load more posts (pagination)',
      argTypes: []
    },
    loadMoreFollowers: {
      description: 'Load more followers (pagination)',
      argTypes: []
    },
    loadMoreFollowing: {
      description: 'Load more following (pagination)',
      argTypes: []
    },
    loadMoreLists: {
      description: 'Load more lists (pagination)',
      argTypes: []
    },

  },
});

PLASMIC.registerComponent(BlueskyVideo, {
  name: 'BlueskyVideo',
  props: {
    playlistUrl: 'string',
    thumbnail: 'string',
  },
  importPath: './components/BlueskyVideo',
});

PLASMIC.registerComponent(ContentEditableTextarea, {
  name: "ContentEditableTextarea",
  props: {
    value: {
      type: "string",
      defaultValue: "",
    },
    defaultValue: {
      type: "string",
      defaultValue: "",
    },
    placeholder: {
      type: "string",
      defaultValue: "Type here…",
    },
    disabled: {
      type: "boolean",
      defaultValue: false,
    },
    multiline: {
      type: "boolean",
      defaultValue: true,
    },
    name: {
      type: "string",
      description: "Optional: form field name",
    },

    onChange: {
      type: "eventHandler",
      argTypes: [{ name: "text", type: "string" }],
    },

    onFocus: {
      type: "eventHandler",
      argTypes: [],
    },
    onBlur: {
      type: "eventHandler",
      argTypes: [],
    },
  },
  importPath: "./components/ContentEditableTextarea",

  refActions: {
    clearText: {
      description: "Reset the text to empty",
      argTypes: [],
    },
    // Optional extras; handy in Studio
    setText: {
      description: "Programmatically set the text",
      argTypes: [{ name: "text", type: "string" }],
    },
    focus: {
      description: "Focus the field",
      argTypes: [],
    },
    blur: {
      description: "Blur the field",
      argTypes: [],
    },
  },
});

PLASMIC.registerComponent(AutoScrollDiv, {
  name: 'AutoScrollDiv',
  importPath: './components/AutoScrollDiv',
  // Tell Plasmic about the exposed method
  refActions: {
    scrollTo: {
      description: 'Trigger the scroll manually',
      argTypes: [], // No arguments needed
    },
  },
  props: {
    behavior: {
      type: 'choice',
      options: ['auto', 'smooth'],
      defaultValue: 'smooth',
    },
    block: {
      type: 'choice',
      options: ['start', 'center', 'end'],
      defaultValue: 'start',
    },
    offset: {
      type: 'number',
      defaultValue: 0,
      description: 'Negative value moves scroll UP.',
    },
    scrollOnMount: {
      type: 'boolean',
      defaultValue: true,
      description: 'Uncheck this to only scroll when triggered by an interaction.',
    },
    disabled: {
      type: 'boolean',
      defaultValue: false,
      hidden: (props) => !props.inEditor, // Optional: hide in production
    },
    children: 'slot',
  },
});

PLASMIC.registerComponent(DrawingCanvas, {
  name: 'DrawingCanvas',
  importPath: './components/DrawingCanvas',
  props: {
    canvasWidth: { type: 'number', defaultValue: 320 },
    canvasHeight: { type: 'number', defaultValue: 120 },
    brushSize: { type: 'number', defaultValue: 2 },
    brushSizeLarge: { type: 'number', defaultValue: 6 },
    colors: { type: 'array', defaultValue: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'] },
    onDrawingSubmit: { type: 'eventHandler', argTypes: [{ name: 'imageBlob', type: 'object' }] },
    onDrawingChange: { type: 'eventHandler', argTypes: [{ name: 'imageBlob', type: 'object' }] },
    toolbar: 'slot',
    colorPalette: 'slot',
    children: 'slot',
  },
  providesData: true,
  refActions: {
    submit: { description: 'Submit drawing', argTypes: [] },
    clear: { description: 'Clear canvas', argTypes: [] },
    setTool: { description: 'Set tool (pen/eraser)', argTypes: [{ name: 'tool', type: 'string' }] },
    setBrushSize: { description: 'Set brush size (small/large)', argTypes: [{ name: 'size', type: 'string' }] },
    setColor: { description: 'Set brush color', argTypes: [{ name: 'color', type: 'string' }] },
    getBlob: { description: 'Get drawing as Blob (async)', argTypes: [] },
  },
});






