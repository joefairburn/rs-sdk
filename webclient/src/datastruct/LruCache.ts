import DoublyLinkable from '#/datastruct/DoublyLinkable.js';
import HashTable from '#/datastruct/HashTable.js';
import DoublyLinkList from '#/datastruct/DoublyLinkList.js';

export default class LruCache {
    // constructor
    readonly capacity: number;
    readonly hashtable: HashTable;
    readonly history: DoublyLinkList;
    available: number;

    constructor(size: number) {
        this.capacity = size;
        this.available = size;
        this.hashtable = new HashTable(1024);
        this.history = new DoublyLinkList();
    }

    get(key: bigint): DoublyLinkable | null {
        const node: DoublyLinkable | null = this.hashtable.get(key) as DoublyLinkable | null;
        if (node) {
            this.history.push(node);
        }
        return node;
    }

    put(key: bigint, value: DoublyLinkable): void {
        if (this.available === 0) {
            const node: DoublyLinkable | null = this.history.pop();
            node?.unlink();
            node?.uncache();
        } else {
            this.available--;
        }
        this.hashtable.put(key, value);
        this.history.push(value);
    }

    clear(): void {
        const node: DoublyLinkable | null = this.history.pop();
        if (!node) {
            this.available = this.capacity;
            return;
        }
        node.unlink();
        node.uncache();
    }
}
