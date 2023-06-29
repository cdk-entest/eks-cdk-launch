import { books } from "./book";

export default function Home() {
  return (
    <div className="dark:bg-slate-800 min-h-screen">
      <div className="dark:bg-slate-900 py-3">
        <nav className="flex mx-auto max-w-5xl px-5 justify-between">
          <a href="#" className="font-bold text-2xl dark:text-white">
            Entest
          </a>
          <ul className="hidden md:flex gap-x-3">
            <li className="bg-orange-400 hover:bg-green-600 hover:text-white px-3 py-1 rounded-sm">
              <a className="" target="_blank" href="#">
                About Me
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="relative h-80 flex justify-center items-center dark:bg-slate-800 mb-5">
        <div className="absolute w-full h-full bg-[url('https://d2cvlmmg8c0xrp.cloudfront.net/web-css/singapore.jpg')] bg-no-repeat bg-cover opacity-30"></div>
        <h1 className="z-10 text-3xl font-semibold dark:text-white">
          Web Development on AWS
        </h1>
      </div>
      <div className="mx-auto max-w-5xl dark:bg-slate-800 px-5">
        <div className="grid grid-cols-2 gap-5">
          {books.map((book) => {
            return (
              <div key={book.order}>
                <div className="ml-4 bg-white p-3 dark:bg-slate-900 dark:text-white">
                  <h4 className="font-bold mb-8">{book.title}</h4>
                  <div>
                    <img
                      src={book.image}
                      className="float-left h-auto w-64 mr-6"
                      alt="book-image"
                    />
                  </div>
                  <p className="text-sm">{book.description}</p>
                  <a
                    href="https://www.amazon.com/Data-Engineering-AWS-Gareth-Eagar/dp/1800560419/ref=sr_1_1?crid=28BFB3NXGTM9G&amp;keywords=data+engineering+with+aws&amp;qid=1682772617&amp;sprefix=data+engineering+with+aws%2Caps%2C485&amp;sr=8-1"
                    target="_blank"
                  >
                    <button className="bg-orange-300 px-14 py-3 rounded-md shadow-md hover:bg-orange-400 mt-2">
                      Amazon
                    </button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
