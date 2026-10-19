---
title: "From Paperweight to Homelab"
slug: "from_paperweight_to_homelab"
date_display: "March 10, 2025"
date_iso: "2025-03-10"
description: "Transforming an old laptop into a self-hosted homelab with Immich, Docker, and Tailscale. A journey from Google Photos frustration to running your own infrastructure."
keywords: "Homelab, Self-hosting, Immich, Docker, Tailscale, CGNAT, Google Photos Alternative"
---

As I was going through my daily routine, I received that dreaded Google Photos notification: 'Your storage is 70% full. Upgrade your plan for more storage.' The frustration set in immediately—I had just upgraded my plan a week ago! While pondering how I'd already consumed so much space, my gaze drifted to my old laptop gathering dust on the shelf, with its unused 2TB SSD and substantial computing power sitting idle. In that moment, the idea of self-hosting clicked into place like the final piece of a puzzle.

<figure>
  <img src="assets/vito.png" alt="My old laptop with Vito Corleone" style="width: 80%">
  <figcaption>Figure 1: My old laptop with Vito Corleone</figcaption>
</figure>

Well, whenever I have a problem it's my habit to scour through Reddit for solutions. There I stumbled upon [r/selfhosted](https://www.reddit.com/r/selfhosted). There I found my messiah "Immich". Immich is a self hosted alternative for Google Photos with almost identical features. Immich seemed perfect! Now came the real question that would launch my homelab journey: where do I start?

While I'd been treating my laptop like a relic, this was not really Intel pentium running dinosaur. This was pretty capable for a homelab.

- Intel i5-8250U
- 12 GB RAM
- NVIDIA GeForce MX150

Like any cultured individual I had USB with Arch Linux ready, So I took my laptop and wiped windows and installed Arch linux

Now my idea was that I would run immich through docker and expose the port on my router and voila! I have my homelab ready! Well, things weren't that simple let's say.

Well you see, To address the limitations of IPv4 address exhaustion, ISPs often deploy Carrier-Grade NAT (CGNAT) on their networks. With CGNAT, users are assigned private IP addresses that are not directly accessible from the outside world, effectively sharing a smaller pool of public IP addresses among multiple customers. One potential solution is to rent a publicly accessible static IP address.

Since my goal wasn't to expose traffic to a large number of users on the internet, but rather to connect just a few of my personal devices, a tunneling solution made more sense.

I had few options on the tunneling setup, I went with the one which was very easy to setup and manage which is **Tailscale**. Tailscale itself is based of wireguard, has amazing documentation and community which made it a perfect choice for me.

As of today (the date of this blog), I'm running a few self-hosted services on my old laptop. It's pretty amazing how a device I once considered obsolete has now become a central part of my digital ecosystem.

<figure>
  <img src="assets/glance.png" alt="Screenshot of my Glance dashboard" style="width: 80%">
  <figcaption>Figure 2: Screenshot of my Glance dashboard</figcaption>
</figure>

What started as frustration with Google Photos storage costs led me down the rabbit hole of self-hosting. I'm still at the surface, excited to see what lies deeper.

I'll leave some relevant links below for anyone interested in diving deeper into the topics discussed in this blog.

- Homelab configs: [https://github.com/dracarys18/homelab.git](https://github.com/dracarys18/homelab.git)
- CGNAT: [https://en.wikipedia.org/wiki/Carrier-grade_NAT](https://en.wikipedia.org/wiki/Carrier-grade_NAT)
- [Interesting RFC proposing CGNAT as a temporary solution before the world moves to IPv6](https://datatracker.ietf.org/doc/html/rfc6264)
