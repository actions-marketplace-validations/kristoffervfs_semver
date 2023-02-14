export interface IScope {
    repo : IScopeRepository;
    commitish : string;
}

export interface IScopeRepository {
    owner : string;
    name : string;
}