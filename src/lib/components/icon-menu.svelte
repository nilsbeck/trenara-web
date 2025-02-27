<script lang="ts">
    import type { User } from '$lib/server/api/types';
    let { userData }: { userData: User } = $props();

    let profilePicture = $derived(userData.profile_picture.path ? userData.profile_picture.path : 'https://img.daisyui.com/images/stock/photo-1534528741775-53994a69daeb.webp');
</script>

<div class="dropdown dropdown-end">
    <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
      <div class="w-10 rounded-full">
        <img
          alt="User Profile"
          src={profilePicture} />
      </div>
    </div>
    <ul
      class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow">
      <!-- <li>
        <a href="/profile" class="justify-between">
          Profile
          <span class="badge">New</span>
        </a>
      </li>
      <li>Settings</li> -->
      <li><a href="/user">Dashboard</a></li>
      <li><a href="/user/profile">Profile</a></li>
      <li class="block md:hidden"><a href="/user/goal">Goal/Predictions</a></li>
      <li><a href="/logout">Logout</a></li>
    </ul>
  </div>
