const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require("@octokit/action");

// regexes determining level of version change
const majorRegex = new RegExp("^(breaking|BREAKING)(\(.+\)):.*");
const minorRegex = new RegExp("^(feat)(\(.+\)):.*");
const patchRegex = new RegExp("^(fix|perf|refactor)(\(.+\)):.*");
const breakingRegex = new RegExp("^(breaking|BREAKING)(\(.+\)):.*");
const featureRegex = new RegExp("^(feat)(\(.+\)):.*");
const fixRegex = new RegExp("^(fix)(\(.+\)):.*");
const perfRegex = new RegExp("^(perf)(\(.+\)):.*");
const refactorRegex = new RegExp("^(refactor)(\(.+\)):.*");


// github client
const octokit = new Octokit({
  auth: core.getInput('GITHUB_TOKEN')
});

// scope
const scope = {
  repo: {
    owner: github.context.payload.repository.owner.name,
    name: github.context.payload.repository.name
  },
  commitish: github.context.payload.commits[github.context.payload.commits.length - 1].id
};

// program
createNewRelease().then((result) => {

  if(!result){
    console.log('No need for new release');
    core.setOutput('new-release-created', false);
  }
  
  console.log('Release ' + result + ' created');
  core.setOutput('new-release-created', true);
  core.setOutput('new-version', result);
  

}).catch((error) => {

  core.setOutput('new-release-created', true);
  core.setOutput('new-version', null);
  core.setFailed(error.message);

});



async function createNewRelease(commits, currentVersion){

  // get latest release
  let latestRelease = await getLatestRelease();
  // get commtis after last release
  let newCommits = await getNewCommits(latestRelease.commitSha);
  // calculate new version based on last release and new commits
  let newVersion = calculateNewVersion(newCommits, latestRelease.version);

  if(!newVersion)
    return null;

  // creates new release  
  await octokit.request('POST /repos/{owner}/{repo}/releases', {
    owner: scope.repo.owner,
    repo: scope.repo.name,
    tag_name: newVersion,
    target_commitish: scope.comitish,
    name: newVersion,
    body: generateReleaseNotes(newCommits),
    draft: false,
    prerelease: false,
    generate_release_notes: true
  })

  return newVersion;  

}

async function getLatestRelease(){

  // gets latest version from github api
  let latestRelease = await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
    owner: scope.repo.owner,
    repo: scope.repo.name
  });

  if(!latestRelease)
    throw new Error('Could not find any releases');

  // gets reference of last release
  let latestReleaseRef = await octokit.request('GET /repos/{owner}/{repo}/git/ref/tags/{ref}', {
    owner: scope.repo.owner,
    repo: scope.repo.name,
    ref: latestRelease.data.tag_name
  });  

  // throw exception if last commit didn't reference a commit
  if(!latestReleaseRef || !latestRelease.data ||!latestReleaseRef.data.object.type == 'commit')
    throw new Error('Latest relase is not referencing a commit');

  return {
    version: latestRelease.data.name,
    commitSha: latestReleaseRef.data.object.sha
  };

}

async function getNewCommits(limitorSha){      

  // gets all commits
  let request = await octokit.request('GET /repos/{owner}/{repo}/commits', {
    owner: scope.repo.owner,
    repo: scope.repo.name
  });

  let commits = request.data;
  
  // loops throug array of commmit starting from newest
  var newCommits = [];
  for(let i = 0; i < commits.length; i++){
    
    let commit = commits[i];

    // breaks when we reach same commit as limitor
    if(commit.sha == limitorSha)
      break;

    // adds commit sha and message to array of new commits
    newCommits.push({
      sha: commit.sha,
      message: commit.commit.message
    });
  }

  // returns new commits since sha 
  return newCommits.reverse();

}

function calculateNewVersion(commits, verString){

  let currentVersion = splitVerison(verString);

  let major = false;
  let minor = false;
  let patch = false;

  console.log('New commits:');

  for(let i = 0; i < commits.length; i++){

    let commit = commits[i];
    console.log(commit.message + ', ' + commit.sha.slice(0,7));

    if(commit.message.match(majorRegex))
      major = true;

    if(commit.message.match(minorRegex))
      minor = true;

    if(commit.message.match(patchRegex))
      patch = true;
  }

  if(major)
    return formatVersion(currentVersion.major + 1, 0, 0);
  else if(minor)
    return formatVersion(currentVersion.major, currentVersion.minor + 1, 0);
  else if(patch)
    return formatVersion(currentVersion.major, currentVersion.minor, currentVersion.patch + 1);
  else
    return null;

}

function formatVersion(major, minor, patch){
  return 'v' + major + '.' + minor + '.' + patch; 
}


function splitVerison(verStr){

  verStr = verStr.replace('v', '');
  let arr = verStr.split('.');

  return {
    major: Number(arr[0]),
    minor: Number(arr[1]),
    patch: Number(arr[2])
  };

}

function generateReleaseNotes(commits){


  let breakingChanges = [];
  let features = [];
  let fixes = [];
  let performance = [];
  let refactor = [];

  for(let i = 0; i < commits.length; i++){

    let commitMessage = commits[i].message;

    if(commitMessage.match(breakingRegex)){

      breakingChanges.push(getCommitMessage(commitMessage))

    } else if(commitMessage.match(featureRegex)){
      
      features.push(getCommitMessage(commitMessage));

    } else if(commitMessage.match(fixRegex)){

      fixes.push(getCommitMessage(commitMessage));
      
    } else if(commitMessage.match(perfRegex)){

      performance.push(getCommitMessage(commitMessage));
      
    } else if(commitMessage.match(refactorRegex)){

      refactor.push(getCommitMessage(commitMessage));
      
    }
    
  }

  let releaseNotes = '';

  if(breakingChanges){
    releaseNotes += '###### BREAKING: \n'
      + breakingChanges.map(i => '*' + i + '\n');
  }  

  if(features){
    releaseNotes += '###### Features: \n'
      + features.map(i => '*' + i + '\n');
  }

  if(fixes){
    releaseNotes += '###### Bug Fixes: \n'
      + fixes.map(i => '*' + i + '\n');
  }

  if(performance){
    releaseNotes += '###### Perfomance improvements: \n'
      + performance.map(i => '*' + i + '\n');
  }

  if(refactor){
    releaseNotes += '###### Refactoring: \n'
      + refactor.map(i => '*' + i + '\n');
  }

  return releaseNotes;
  
}


function getCommitMessage(str){

  let arr = /\(([^)]+)\):(.+)/.exec(str);
  return '**' + arr[1].replace(/\(|\)/g,'') + '**, ' + arr[2].replace(/^ /g, '');

}
