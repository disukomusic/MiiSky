/**
 * Recursively walks a thread tree (or array of nodes) and applies `updateFn`
 * to the node whose `post.uri` matches `targetUri`, returning a new structure.
 *
 * - Accepts either a single node or an array of nodes.
 * - Preserves immutability by cloning only the path that changes (replies branch).
 * - If no match is found, returns the original node(s) unchanged.
 */
export const updateThreadNode = (
    nodes: any[] | any,
    targetUri: string,
    updateFn: (node: any) => any
): any => {
    // If we have a list, update each element (handles top-level replies arrays).
    if (Array.isArray(nodes)) {
        return nodes.map((node) => updateThreadNode(node, targetUri, updateFn));
    }

    // Defensive guard: not a node shape we know how to traverse.
    if (!nodes || !nodes.post) return nodes;

    // Match: apply caller-provided transform to this node.
    if (nodes.post.uri === targetUri) {
        return updateFn(nodes);
    }

    // Otherwise, recurse into children and clone this node only if it has replies.
    if (nodes.replies && nodes.replies.length > 0) {
        return {
            ...nodes,
            replies: updateThreadNode(nodes.replies, targetUri, updateFn),
        };
    }

    // Leaf node (no replies) and not a match.
    return nodes;
};
