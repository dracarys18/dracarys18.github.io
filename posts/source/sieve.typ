// Metadata
#let title = "SIEVE: An Efficient Cache Eviction"
#let slug = "sieve"
#let date_display = "September 6, 2024"
#let date_iso = "2024-09-06"
#let description = "Deep dive into SIEVE cache eviction algorithm, comparing it with LRU and exploring its implementation. Understanding modern caching strategies."
#let keywords = "SIEVE, Cache Eviction, LRU, Caching Algorithms, Computer Science, Systems Programming"

// Content starts here

= #title

As we approach the 26th anniversary of the 21st century, hardware continues to get cheaper and more powerful. Data centers now operate with terabytes of RAM, a scale that would have been unimaginable not long ago. Yet, as the old saying goes, Memory is never truly infinite.

#figure(
  image("../assets/the_cloud.png", width: 80%),
  caption: [The Cloud]
)

Cache eviction algorithms have evolved a lot, and there's no single strategy that fits every need. That's why we've ended up with so many of them.

I came across the SIEVE eviction policy and wanted to see how it really works. The best way to learn, at least for me, is to try building it myself. So I decided to write a cache with SIEVE eviction, using Zig as my language of choice. Let's see how it goes!

```zig
/// The cache object
pub fn Cache(comptime K: type, comptime V: type) type {
    return struct {
        /// Thread-safe Wrapper over traditional hashmap
        inner: map.ChashMap(K, *Node(K, V)),

        /// Doubly linkedlist for the eviction
        expiry: DoubleLinkedList(K, V),

        /// Allocator
        allocator: std.mem.Allocator,

        /// Eviction policy enum
        eviction: EvictionPolicy(K, V),

        /// Size of the cache
        limit: usize,

        /// Optional TTL
        ttl: ?i64,

        const Self = @This();
    };
};
```

This is our basic cache object. Internally, it uses a doubly linked list to keep track of which element should be evicted next. Alongside that, we maintain a `size` to enforce capacity limits, and a `ttl` (time-to-live) attribute so entries can expire automatically after a certain duration.

== Insert

Now with that settled, let's walk through what actually happens when we insert an object into the cache. This is where the behavior of SIEVE starts to look different from the traditional LRU approach. In LRU, every insert pushes the item to the back of the queue so it's treated as the most recently used. SIEVE, on the other hand, takes a lighter path—placing items at the front and marking them with a simple `visited` flag. This small change is what gives SIEVE its efficiency later when it comes time to evict entries.

Take a look at the code below, whenever we insert an element into the cache if the element is already found LRU moves it to the back to indicate the object was recently used while SIEVE just marks it as visited. A little tweak but it's gonna come in handy later during eviction

```zig
pub inline fn insert(
    self: Self,
    allocator: std.mem.Allocator,
    node: ?*Node(K, V),
    queue: *DoubleLinkedList(K, V),
    key: K,
    value: V,
) !?*Node(K, V) {
    switch (self) {
        .LeastRecentlyUsed => {
            if (node) |nonull_node| {
                nonull_node.data = value;
                queue.moveToBack(nonull_node);
                return null;
            } else {
                const new_node = try Node(K, V).init(key, value, allocator);
                const is_pushed = queue.push_back(new_node);

                if (is_pushed) {
                    return new_node;
                } else {
                    new_node.deinit();
                    return null;
                }
            }
        },
        .Sieve => {
            if (node) |nonull_node| {
                nonull_node.data = value;
                nonull_node.visited = true;
                return null;
            } else {
                const new_node = try Node(K, V).init(key, value, allocator);
                const is_pushed = queue.push_front(new_node);

                if (is_pushed) {
                    return new_node;
                } else {
                    new_node.deinit();
                    return null;
                }
            }
        },
    }
}
```

== Lookup

Now that we've covered how inserts work, let's move on to lookups—the `get` operation. After all, the whole point of a cache is to serve as many requests as possible from memory, which means aiming for more cache hits and fewer misses.

In LRU, every time you fetch an object from the cache, it's moved to the back of the queue and treated as the most recently used. This means that even an occasional access is enough to keep the object from being evicted, as long as other items don't crowd the cache beyond its limit.

SIEVE takes a different approach. When you fetch an object, it doesn't shuffle the queue like LRU does. Instead, it simply marks the item as `visited`. This makes the policy more lightweight: items don't get artificially promoted to the "safest" position with every single access, but are still given a chance to survive eviction if they're actually used again. In other words, SIEVE avoids keeping rarely used objects around forever just because they were accessed once.

The idea of tagging recently accessed items with a simple marker isn't entirely new it comes from the CLOCK eviction policy, which uses reference bits to track whether an item has been accessed recently.

```zig
pub inline fn get(
    self: Self,
    node: ?*Node(K, V),
    queue: *DoubleLinkedList(K, V),
) ?V {
    switch (self) {
        // On every get the node is moved to back in LRU
        .LeastRecentlyUsed => {
            if (node) |nonull_node| {
                queue.moveToBack(nonull_node);
                return nonull_node.data;
            } else {
                return null;
            }
        },
        // SIEVE does not modify the queue, rather it just marks the node as visited
        .Sieve => {
            if (node) |nonull_node| {
                nonull_node.set_visited(true);
                return nonull_node.data;
            }
            return null;
        },
    }
}
```

== Eviction

Now that we understand how lookups work, let's move on to eviction. We've already touched on the idea of how items are chosen to be removed, but now it's time to look at the actual mechanics of how eviction is carried out.

```zig
 pub inline fn evict(self: Self, ll: *DoubleLinkedList(K, V)) ?K {
        switch (self) {
            .LeastRecentlyUsed => {
                if (ll.front) |front| {
                    return front.key;
                }
                return null;
            },

            .Sieve => {
                var hand = ll.cursor orelse ll.back;

                while (hand) |node| : (hand = node.prev orelse ll.back) {
                    if (!node.visited) {
                        ll.cursor = node.prev;
                        return node.key;
                    }
                    node.visited = false;
                }
                return null;
            },
        }
    }
```

Eviction is basically the moment when the cache decides who gets to stay and who has to go. In LRU, it's simple — the item that's been ignored the longest (sitting at the front of the queue) gets evicted. SIEVE handles this a little differently. It looks at the item at the front: if it's been marked as `visited`, the cache clears that mark and gives the item another chance by moving it to the back. If it hasn't been touched in a while, it's shown the door. This way, things you actually use tend to stick around, and the stale stuff slowly makes its way out.

#figure(
  image("../assets/sieve_diagram.gif", width: 80%),
  caption: [How does SIEVE work (Credits: #link("https://cachemon.github.io/SIEVE-website/")[Cachemon])]
)

== Takeaways

Well that's a wrap! If this stuff got you curious, I'll drop a link to the full repo below. Honestly, the most fun part of writing this wasn't typing out the blog—it was building SIEVE myself and seeing it click. I really believe the best way to learn is by rolling up your sleeves and trying it out. It scratches that curiosity itch in a way just reading never does.

Oh also I am new to zig so if you are angry at how I wrote the code, I totally understand :p

== References

- #link("https://cachemon.github.io/SIEVE-website/")[Cachemon]
- #link("https://junchengyang.com/publication/nsdi24-SIEVE.pdf")[SIEVE: CMU Paper (NSDI 2024)]
- #link("https://github.com/dracarys18/cerca")[Cerca Repository (My full implementation)]
