// Metadata
#let title = "HyperLogLog: Counting without Counting"
#let slug = "hyperloglog"
#let date_display = "September 24, 2024"
#let date_iso = "2024-09-24"
#let description = "Deep dive into HyperLogLog, a probabilistic counting algorithm that estimates cardinality with minimal memory. Implementation and mathematical analysis included."
#let keywords = "HyperLogLog, Probabilistic Algorithms, Cardinality Estimation, Data Structures, Computer Science"

// Content starts here

Every time I read about a probabilistic data structure, I'm blown away — like, who even came up with this stuff? (Philippe Flajolet did). Even after I understand how it works, it still feels magical.

In this blog, I'll explain how it works — with as few Greek letters as possible, So you have your mind blown too :)

I've implemented the HyperLogLog algorithm in Zig. Check out the repository here: #link("https://github.com/dracarys18/wood")[https://github.com/dracarys18/wood]

== Counting Unique Elements

Counting unique elements is a memory heavy task, it requires you to remember all the elements that has ever been pushed to the set which could be very high. Hyperloglog on the other hand uses small constant amount of memory to get the unique count.

With just 16KB of memory it can count the cardinality of billions of items with *error rate below 1%*

== How does it work?

Imagine you have a byte. What are the chances that the first bit is zero? It's 50%. What about the first two bits being zero? That's 25%. In general, the probability that the first `n` bits are zero is:

```
P(first n bits are zero) = 1 / 2^n
```

For example, the probability that the first 10 bits are all zero is 1/1024. This means that, on average, you would need 1,024 numbers to get one where the first 10 bits are zero.

That's the basic idea of HyperLogLog it estimates the number of unique number in the set by just using the first n leading zeroes of the hashed values

So why hash the bits why not just count the zeroes in raw bits? Hashing the value gives you random-looking distribution of bits without hashing whereas the raw input values might have patterns or clusters that will bias to the algorithm, making our estimates inaccurate.

In a large set of numbers, there's a high chance that some values will be unusual or extreme. To reduce the effect of these "freak" values, HyperLogLog divides the numbers into multiple buckets. The more buckets you have, the more accurate the estimate becomes. When initializing HyperLogLog, you provide a precision `p`, which determines the number of buckets as:

```
m = 2^p
```

After using the first `p` bits to pick a bucket, the remaining bits of the hash are used to count the number of leading zeros. This is the clever part that allows HyperLogLog to estimate the total number of unique items.

Each bucket keeps track of the largest number of leading zeros it has seen. Later, HyperLogLog combines the information from all buckets to produce a single estimate. By using multiple buckets, the highs and lows from random chance balance out, giving a much more reliable result — all while using very little memory.

== Count(Main Part)

Now that we understand there are m = 2^p buckets and each bucket stores the largest number of leading zeros it has seen, it's time to look at how HyperLogLog uses this information to estimate the total number of unique items.

HyperLogLog combines the data from all buckets using a simple idea: if some buckets have very high leading-zero counts, it means the dataset is likely large. If most buckets have small counts, the dataset is smaller. By averaging these counts and applying a correction formula, HyperLogLog calculates an estimate of the number of unique elements.

The formula might look complicated at first, but the intuition is straightforward: each bucket gives a hint about the size of the dataset, and combining all these hints produces a reliable estimate without ever storing all the items.

The HyperLogLog estimate is given by:

```
E = α_m × m² × (Σ(j=1 to m) 2^(-M[j]))^(-1)
```

Where:

- E = estimated number of unique items
- m = 2^p = number of buckets
- M[j] = largest number of leading zeros observed in bucket j
- α_m = bias correction constant (depends on m)

Woah, woah! I promised no Greek letters… I tried, but let me explain.

Let's focus on the inner part of the formula:

```
m² × (Σ(j=1 to m) 2^(-M[j]))^(-1)
```

In this formula, j is the bucket number, and M[j] is the maximum count of leading zeros seen in that bucket. As we saw before, 1/2^(M[j]) roughly estimates how many items ended up in that bucket.

Up to this point, we've only looked at one bucket's estimate. You might think we could just average all the buckets, but a single very large value can throw off the result. HyperLogLog avoids this by using the *harmonic mean*, which evens out the buckets and keeps the estimate more accurate. Thus the reciprocal on the sum on the formula multiplied by the bucket size. The harmonic mean only tells us the average estimate for a single bucket. To estimate the total number of unique items across all buckets, we multiply it by the total number of buckets.

Now we have finished explaining the basic estimate, but this number can vary for very small or very large datasets:

- *Small range:* When the dataset is small, many buckets are still zero. In this case, the formula tends to underestimate the number of unique items.
- *Large range:* When the dataset is very large, the formula can overestimate the count significantly.

Now this is where the mysterious Greek letter comes in. It's called the *bias correction constant*, and its job is to make the estimate slightly more accurate.

When Hyperloglog was initially developed the researchers went through a lot of data and checked the ratio between raw estimate and actual count and came up with the bias correction constant

Here's the formula for bias correction:

- For m = 16: α_m = 0.673
- For m = 32: α_m = 0.697
- For m = 64: α_m = 0.709
- For m >= 128:

```
α_m = 0.7213 / (1 + 1.079 / m)
```

So why does α_m change based on the number of buckets? When the number of buckets is small, the estimate tends to have a slightly different bias than when the number of buckets is large. The constant α_m adjusts for this difference to keep the estimate accurate.

== Error Rate

So after all these calculations, the formula for Hyperloglog standard error rate is:

```
Standard Error = 1.04 / √m
```

The smaller the number of buckets, the higher the error will be. Each bucket stores a small number (the maximum number of leading zeros seen), so using fewer buckets means less memory is used but also less information is captured, which increases the error.

== Conclusion

Well, there you have it, a deep dive into probabilistic counting! When I first read the original HyperLogLog paper, it was full of math and symbols, and it took me a while to wrap my head around it. Here, I've tried to make it as simple and readable as possible. I hope you enjoyed it! I didn't include all the code examples because the blog was already long enough, but you can always check out the implementation on my GitHub.

== References

- Philippe Flajolet, Éric Fusy, Olivier Gandouet, and Frédéric Meunier. #link("https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf")[HyperLogLog: The analysis of a near-optimal cardinality estimation algorithm]
- #link("https://research.google/pubs/pub40671/")[Google. "HyperLogLog in Practice", 2013.]
- #link("https://engineering.fb.com/2018/12/13/data-infrastructure/hyperloglog/")[Meta (Facebook). "Presto: Distributed SQL Query Engine" — HyperLogLog implementation.]
