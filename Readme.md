# Bookmarker for Nextcloud

<p>

### Chrome Extension for bookmarking web pages on your Nextcloud server.

<img src="Readme%20images/icon.png" align="right"
     width="128" height="128">

</p>

## Table of contents

<!-- Start Document Outline -->

- [Table of contents](#table-of-contents)
- ❔ [Why?](#-why)
- 💡 [Highlights](#-highlights)
- 🔧 [Installation](#-installation)
- [Usage](#usage)
- 🔩 [Options](#-options)
  - [Basic Options](#basic-options)
  - [Zen](#zen)
  - [Advanced](#advanced)
  - [Development](#development)
- 🎉 [Things to come](#-things-to-come)
- 🐱‍💻 [Open software that I used](#-open-software-that-i-used)

<!-- End Document Outline -->

## :grey_question: Why?

Why use another bookmarking tool for Chrome and Nextcloud when [Floccus](https://floccus.org) already exists?

- No folder support.
- No keywords/tags support.
- Chrome's native bookmarking support breaks down if you have many items (> 1000).

## :bulb: Highlights

- **<u>Automatic keywords</u>**  
  _Bookmarker for Nextcloud_ attempts to determine keywords (also known as tags) for the web page. If successful, it will display those that are already used for other saved links, to avoid cluttering with too many keywords.
- **<u>Keywords autocomplete</u>**  
  If you're entering keyword for the bookmark _Bookmarker for Nextcloud_ will look through your tags and suggest items.
- **<u>Automatic descriptions</u>**  
  Documenting things is always hard, so _Bookmarker for Nextcloud_ automatically scans the page for a description.
- **<u>Quick operation</u>**  
  Instead of fetching data every single time from Nextcloud _Bookmarker for Nextcloud_ tries to cache as many data as possible to accelerate operation.

## :wrench: Installation

<div>

The easiest way to install _Bookmarker for Nextcloud_ is through the [Google Webstore](https://chromewebstore.google.com/detail/bookmarker-for-nextcloud/nnfoalnhmdfefeoggnhglcgfgeneolii).

If you want to have the bleeding edge version, you can clone the [GitHub repository](https://github.com/Latz/BookmarkerForNextcloud) and build the extension yourself:

> git clone https://github.com/Latz/Bookmarker-For-Nextcloud.git  
> npm install  
> npm run build

The extension is built into the directory `dist`. Finally you can install the [unpacked extension](https://webkul.com/blog/how-to-install-the-unpacked-extension-in-chrome/).

</div>

## 🔑 Authorization

<div>
After the installation you have to click the Extensions icon and pin *Bookmarker for Nextcloud* to the toolbar to have it available permanently.

![](Readme%20images/pin2.png)

_Bookmarker for Nextcloud_ needs to register with your Nextcloud installation. When you click on the icon for the first time, _Bookmarker for Nextcloud_ will display a button:

![](Readme%20images/authorize.png)

When clicked, a tab will open where you must enter the address of your NextCloud server. Notice: This does not work if the active tab is a system tab (e.g. `chrome://` or `about://`).

![](Readme%20images/login-400x300.png)

After clicking on the "Open login page" button, another tab will open. You will be asked to enter your login details:

![](Readme%20images/nclogin-400x300.png)

If your browser is already logged in to NextCloud, it will simply ask you to grant access:

![](Readme%20images/GrantAccess-400x300.png)

The extension is now connected to Nextcloud. You can close the tab.

![](Readme%20images/AccountConnected-400x300.png)

</div>

## Usage

Depending on your [options](#-options), the interface can look very different:

![](Readme%20images/example1.png)

> 1.  <u>Page URL</u>  
>     The URL of the page.
> 1.  <u>Page title</u>  
>     The tile of the page (extracted from the `<title>` tag).  
>     👉🏻 This is the only element that can't be disabled in the options.
> 1.  <u>Folders</u>  
>     The folder in which the bookmark is stored. You can select multiple folders by holding the `Ctrl` key while selecting a folder.  
>     👉🏻 If this selection box is disabled the bookmark is stored in the `Root` folder.
> 1.  <u>Keywords / Tags</u>  
>     You can define keywords to group bookmarks. _Bookmarker for Nextcloud_ will extract keywords from the web page (as far as these are provided by the page) and then compares them to the existing keywords and displays the matches.  
>     You can add keyword by clicking into the element, entering the keyword, pressing the `Enter` key and delete keywords by clicking on the `x` at the end of each keyword.  
>     👉🏻 If the element is disabled in the options no keywords are stored.
> 1.  <u>Description</u>  
>     Some description of the web page. To make things easier, _Bookmarker for Nextcloud_ will try to extract a description from the page.  
>     👉🏻 If this element is disabled no description will be stored.
> 1.  <u>Save</u>  
>     Save the bookmark. If enabled in the options a system message will appear on success or display an error message, if there are any problems.

### Refreshing the cache

To speed up operation _Bookmarker for Nextcloud_ is caching the keywords and the folders, so they need not to be loaded every time the user is creating a bookmark. The default caching time is 24 hours (soon to be customizable in the options). If you are changing the keywords or folders on the server this will not be reflected immediately in _Bookmarker for Nextcloud_.
You can refresh the cache and reload the data from the server by clicking "Refresh Cache" in the extension's right click menu.

## :nut_and_bolt: Options

You can access the options by right clicking on the extension icon:

![](Readme%20images/menu-options.png)

The option page is divided into four main sections:

![](Readme%20images/options.png)

**Basic** - Interesting for most users  
**Advanced** - Fine tuning  
**Zen** - Distracting free bookmarking (not available yet)  
**Development** - Convenience options for development

### 📊 Basic

- **<u>Auto tags</u>**  
   Try to detect keywords or tags from the web site and display those already used for other links.  
  👉🏻 _Default: Enabled_
- **<u>Display Folders</u>**  
   Display folders for organizing your bookmarks.  
  👉🏻 _Default: Enabled_
- **<u>Auto description</u>** Try to detect the description from the web site.  
  👉🏻 _Default: Enabled_
- **<u>Display success notification</u>**  
   Display a system message that your bookmark has been saved successfully, or an error message if there was any problem.  
  👉🏻 _Default: Enabled_

### 😌 Zen

Still to come.

### 🚀 Advanced

- **<u>Check for stored bookmarks</u>**  
   _Bookmarker for Nextcloud_ can check if you stored the current site already, retrieve the data from Nextcloud and display it in the popup. Depending on your Internet connection and server capabilities this can take some time and might be annoying.  
  👉🏻 _Default: Enabled_
- **<u>Show Url</u>**  
  To keep the interface straight _Bookmarker for Nextcloud_ refrains from displaying the URL by default since most users won't change it anyway.  
  👉🏻 _Default: Disabled_
- **<u>Show description</u>**  
  Describing things is always difficult, the same goes with bookmarks. So _Bookmarker for Nextcloud_ does the best to check the web sites for provided descriptions.  
  👉🏻 _Default: Disabled_
- **<u>Use extended keyword detection</u>**  
  Some web sites don't provide any keywords that _Bookmarker for Nextcloud_ is able to recognize, so as a last resort it loops through the headlines of the page (_H1_ to _H6_) and matches the words with the stored keywords. To keep things straight you can limit the level of headlines being searched (Advanced Options). Additionally, the so found keywords are matched to the stored keywords, this can't be disabled.  
  👉🏻 _Default: Disabled_

### 👩‍💻 Development

<div>

These options are used during the extension development process.

</div>

## :tada: Things to come

- Even faster operation through better caching.
- Better keyword editing.
- Fuzzy keyword detection.
- More magic! ✨

## 🐱‍💻 Open software that I used

- [TailwindCSS](https://tailwindcss.com)
- [DaisyUI](https://daisyui.com)
- [CSS Loaders](https://css-loaders.com)
- [readable-http-codes](https://github.com/arsamsarabi/readable-http-codes)
- [CSS Loaders](https://css-loaders.com/eyes/)
- [Tagify](https://github.com/yairEO/tagify)
- [idb](https://github.com/jakearchibald/idb)
- [Parcel](https://parceljs.org)
